const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === LOAD CONFIGURATION ===
let config;
try {
    config = require('./config.json');
} catch (err) {
    console.error("FATAL ERROR: Could not find config.json. Please create it in the root folder.");
    process.exit(1);
}

const USER_KEY = config.userKey;
const SECRET_KEY = config.secretKey;

// Endpoint to dynamically provide API keys to the frontend
app.get('/api/apikeys', (req, res) => {
    res.json(config.apiKeys || []);
});

function formatGigyaDate(date) {
    return date.toISOString().split('.')[0] + 'Z';
}

app.post('/api/search-audit', async (req, res) => {
    console.log('\n================ NEW AUDIT SEARCH REQUEST ================');
    const { uid, apiKey, dataCenter, logType } = req.body;

    if (!uid || !apiKey) {
        return res.status(400).json({ error: 'Please provide a UID and select an API Key.' });
    }

    const dc = dataCenter || 'us1';
    const targetTable = (logType === 'auditLogEvent') ? 'auditLogEvent' : 'auditLog';
    const endpointUrl = `https://audit.${dc}.gigya.com/audit.search`;

    const now = new Date();
    const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
    const oneYearAgo = new Date(now); oneYearAgo.setMonth(now.getMonth() - 12);
    const eighteenMonthsAgo = new Date(now); eighteenMonthsAgo.setMonth(now.getMonth() - 18);
    const twoYearsAgo = new Date(now); twoYearsAgo.setMonth(now.getMonth() - 24);

    const timeRanges = [
        { label: '0-6 Months Ago', from: formatGigyaDate(sixMonthsAgo), to: null },
        { label: '6-12 Months Ago', from: formatGigyaDate(oneYearAgo), to: formatGigyaDate(sixMonthsAgo) },
        { label: '12-18 Months Ago', from: formatGigyaDate(eighteenMonthsAgo), to: formatGigyaDate(oneYearAgo) },
        { label: '18-24 Months Ago', from: formatGigyaDate(twoYearsAgo), to: formatGigyaDate(eighteenMonthsAgo) }
    ];

    // Construct tasks dynamically based on the selected audit table type
    const tasks = timeRanges.map(range => {
        let query = `SELECT * FROM ${targetTable} WHERE uid = '${uid}'`;
        
        if (range.to) {
            query += ` AND @timestamp >= '${range.from}' AND @timestamp <= '${range.to}'`;
        } else {
            query += ` AND @timestamp >= '${range.from}'`;
        }

        // Only exclude getAccountInfo for standard auditLog
        if (targetTable === 'auditLog') {
            query += ` AND endpoint != 'accounts.getAccountInfo'`;
        }

        query += ` ORDER BY @timestamp DESC`;

        return { apiKey, rangeLabel: range.label, query };
    });

    console.log(`Target Table: ${targetTable}`);
    console.log(`Executing ${tasks.length} parallel queries to: ${endpointUrl}`);

    const results = await Promise.all(tasks.map(async (task, index) => {
        const startTime = Date.now();
        const callId = `Call #${index + 1} (${task.rangeLabel})`;

        const params = new URLSearchParams();
        params.append('userKey', USER_KEY);
        params.append('secret', SECRET_KEY);
        params.append('apiKey', task.apiKey);
        params.append('query', task.query);

        console.log(`\n--- [PAYLOAD INSPECTION] ${callId} ---`);
        console.log(`Endpoint: ${endpointUrl}`);
        console.log(`Query:    ${task.query}`);
        
        try {
            const response = await axios.post(endpointUrl, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            });

            const duration = Date.now() - startTime;
            const resData = response.data;

            if (resData && resData.errorCode === 0 && Array.isArray(resData.results)) {
                console.log(`[${callId}] SUCCESS (${duration}ms) - Items found: ${resData.results.length}`);
                return {
                    status: 'SUCCESS',
                    range: task.rangeLabel,
                    query: task.query,
                    durationMs: duration,
                    items: resData.results
                };
            } else {
                const errMsg = resData ? (resData.errorMessage || resData.errorDetails || `ErrorCode: ${resData.errorCode}`) : 'Empty Response';
                console.error(`[${callId}] GIGYA ERROR (${duration}ms) - Message: ${errMsg}`);
                return { status: 'GIGYA_ERROR', range: task.rangeLabel, query: task.query, durationMs: duration, error: errMsg, items: [] };
            }
        } catch (err) {
            const duration = Date.now() - startTime;
            const errDetail = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
            console.error(`[${callId}] NETWORK ERROR (${duration}ms) - ${errDetail}`);
            return { status: 'NETWORK_ERROR', range: task.rangeLabel, query: task.query, durationMs: duration, error: errDetail, items: [] };
        }
    }));

    let combinedLogs = [];
    const debugInfo = [];

    results.forEach(resItem => {
        combinedLogs = combinedLogs.concat(resItem.items);
        debugInfo.push({
            status: resItem.status, range: resItem.range, query: resItem.query,
            durationMs: resItem.durationMs, count: resItem.items.length, error: resItem.error || null
        });
    });

    combinedLogs.sort((a, b) => new Date(b['@timestamp']) - new Date(a['@timestamp']));
    console.log(`\n================ SEARCH COMPLETE: ${combinedLogs.length} logs collected ================\n`);

    res.json({ totalCount: combinedLogs.length, totalCalls: tasks.length, results: combinedLogs, debug: debugInfo });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`App running on: http://localhost:${PORT}`);
});