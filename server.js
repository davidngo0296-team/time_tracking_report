const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3001;
const HTML_FILE = 'time_tracking_report.html';
const CSV_FILE = 'Time_tracking_data.csv';
const SCRIPT_FILE = 'update_time_tracking_script.ps1';

const mimeTypes = {
    '.html': 'text/html',
    '.csv': 'text/plain', // Serve CSV as text
    '.js': 'text/javascript',
    '.css': 'text/css'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Serve HTML
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        fs.readFile(path.join(__dirname, HTML_FILE), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading report file.');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Serve CSV
    if (req.method === 'GET' && req.url.replace(/%20/g, ' ').includes(CSV_FILE)) {
        fs.readFile(path.join(__dirname, CSV_FILE), (err, data) => {
            if (err) {
                // If not found, return empty or 404
                res.writeHead(404);
                res.end('CSV file not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(data);
        });
        return;
    }

    // Handle Script execution
    if (req.method === 'POST' && req.url === '/run-update-script') {
        const scriptPath = path.join(__dirname, SCRIPT_FILE);
        console.log(`Executing PowerShell script: ${scriptPath}`);

        const ps = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]);

        let output = '';
        let errorOutput = '';

        ps.stdout.on('data', (data) => {
            output += data.toString();
        });

        ps.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ps.on('close', (code) => {
            if (code !== 0) {
                console.error(`Script exited with code ${code}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Script failed (Exit Code ${code}).\n\nStderr: ${errorOutput}\n\nStdout: ${output}`
                }));
            } else {
                console.log('Script execution successful.');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, output: output }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop.');
});
