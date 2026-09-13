# SAP CDC Audit Logs Collector

Fast Node.js application to query and aggregate 2 years of SAP Customer Data Cloud (`audit.search`) logs by querying four 6-month windows in parallel.

## Setup

1. **Install dependencies:**
   ```bash
   npm install express axios body-parser
   ```

2. **Setup `config.json` file:**
   ```json
   {
     "userKey": "YOUR_USER_KEY",
     "secretKey": "YOUR_SECRET_KEY",
     "apiKeys": [
       { "name": "Site A", "value": "3_YOUR_API_KEY_1" },
       { "name": "Site B", "value": "3_YOUR_API_KEY_2" }
     ]
   }
   ```

## How to Run

### Option 1: Terminal
Open your terminal in the project directory and start the server:

```bash
node server.js
```
Then, open your web browser and navigate to `http://localhost:3000`.

### Option 2: 1-Click Launcher (`start-app.bat`)
Double-click `start-app.bat`. It will automatically start the Node server in a background terminal window and open the web interface for you in your default browser.
