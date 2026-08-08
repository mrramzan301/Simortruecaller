const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - تمام Origins اور Methods کو Allow کرنے کے لیے Custom Headers کے ساتھ
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// External APIs
const TRUECALLER_API = 'https://faisal-ali-truecaller.ftgmhacks.workers.dev/?key=ftgmisking&number=';
const SIMDATA_API = 'https://multi-sim3.vercel.app/api/search?server=5&query=';

// Helper function to clean phone number to standard format (923XXXXXXXXX)
function cleanNumber(number) {
    if (!number) return '';
    let clean = number.toString().replace(/\D/g, ''); // Non-digits کو ختم کرتا ہے
    if (clean.startsWith('0')) {
        clean = '92' + clean.substring(1);
    } else if (!clean.startsWith('92') && clean.length === 10) {
        clean = '92' + clean;
    }
    return clean;
}

// Function to get Truecaller data
async function getTruecallerData(number) {
    try {
        const cleanNum = cleanNumber(number);
        const response = await axios.get(TRUECALLER_API + cleanNum, { timeout: 6000 });
        if (response.data && response.data.data && response.data.data.name) {
            return {
                number: number,
                name: response.data.data.name
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Function to get SIM data
async function getSIMData(query) {
    try {
        const response = await axios.get(SIMDATA_API + query, { timeout: 8000 });
        if (response.data && response.data.status === 'success' && response.data.DATA) {
            return response.data.DATA;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Main API Search Endpoint
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a query (number or CNIC)',
                developer: 'Ramzan Ahsan',
                group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
            });
        }

        const cleanQuery = query.trim();
        const isCNIC = /^\d{13}$/.test(cleanQuery);
        const isNumber = /^\d{10,12}$/.test(cleanQuery) || cleanQuery.startsWith('03');

        if (!isCNIC && !isNumber) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query format. Please provide a valid 13-digit CNIC or valid phone number',
                developer: 'Ramzan Ahsan',
                group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
            });
        }

        const queryToSearch = isNumber ? cleanNumber(cleanQuery) : cleanQuery;
        const simData = await getSIMData(queryToSearch);

        let multiData = [];
        let numbers = [];

        if (simData && Array.isArray(simData)) {
            multiData = simData.map(item => ({
                number: item.NUMBER || item.number || '',
                name: item.NAME || item.name || '',
                cnic: item.CNIC || item.cnic || '',
                address: item.ADRESS || item.address || item.ADDRESS || ''
            }));
            numbers = multiData.map(item => item.number).filter(Boolean);
        }

        // Fast Parallel Processing for Truecaller
        let truecallerResults = [];
        if (numbers.length > 0) {
            const limitedNumbers = numbers.slice(0, 5); // Timeout سے بچنے کے لیے پہلے 5 نمبرز
            const promises = limitedNumbers.map(num => getTruecallerData(num));
            const results = await Promise.all(promises);
            truecallerResults = results.filter(item => item !== null);
        } else if (isNumber) {
            const tcData = await getTruecallerData(queryToSearch);
            if (tcData) {
                truecallerResults.push(tcData);
            }
        }

        // Combining SIM Data with Truecaller Data
        const combinedData = multiData.map(sim => {
            const tcMatch = truecallerResults.find(tc => cleanNumber(tc.number) === cleanNumber(sim.number));
            return {
                number: sim.number,
                sim_name: sim.name,
                truecaller_name: tcMatch ? tcMatch.name : 'Not Found',
                cnic: sim.cnic,
                address: sim.address
            };
        });

        return res.json({
            success: true,
            developer: 'Ramzan Ahsan',
            group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ',
            query: cleanQuery,
            query_type: isCNIC ? 'CNIC' : 'NUMBER',
            sim_data: multiData,
            truecaller_data: truecallerResults,
            combined_data: combinedData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error processing request',
            error: error.message,
            developer: 'Ramzan Ahsan',
            group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
        });
    }
});

// Health check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'API is running',
        developer: 'Ramzan Ahsan',
        group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
    });
});

// Root Endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'SIM Data & Truecaller Combined API',
        endpoints: {
            search: '/api/search?query=YOUR_NUMBER_OR_CNIC',
            health: '/api/health'
        },
        developer: 'Ramzan Ahsan',
        group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
    });
});

// Local Development Server
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Module Export for Vercel Serverless Architecture
module.exports = app;
