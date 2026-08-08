const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - تمام Origins اور Methods کو Allow کرنے کے لیے
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// External APIs
const TRUECALLER_API = 'https://faisal-ali-truecaller.ftgmhacks.workers.dev/?key=ftgmisking&number=';
const SIMDATA_API = 'https://multi-sim3.vercel.app/api/search?server=5&query=';

// Helper function: نمبر کو 923XXXXXXXXX فارمیٹ میں لانے کے لیے
function cleanNumber(number) {
    if (!number) return '';
    let clean = number.toString().replace(/\D/g, ''); // Non-digits ختم کرتا ہے
    if (clean.startsWith('0')) {
        clean = '92' + clean.substring(1);
    } else if (!clean.startsWith('92') && clean.length === 10) {
        clean = '92' + clean;
    }
    return clean;
}

// Truecaller سے نام نکالنے کا فنکشن
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

// SIM Database سے ڈیٹا نکالنے کا فنکشن
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

// Main Search Endpoint
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
                message: 'Invalid query format. Provide a valid 13-digit CNIC or phone number',
                developer: 'Ramzan Ahsan',
                group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
            });
        }

        let simDataResult = null;
        let fetchedCNIC = null;

        if (isCNIC) {
            // اگر برا ہِ راست CNIC دیا گیا ہو
            simDataResult = await getSIMData(cleanQuery);
            fetchedCNIC = cleanQuery;
        } else if (isNumber) {
            //Step 1: اگر نمبر دیا گیا ہو تو پہلے اس نمبر کا ڈیٹا نکالیں
            const cleanedNum = cleanNumber(cleanQuery);
            const initialData = await getSIMData(cleanedNum);

            if (initialData && Array.isArray(initialData) && initialData.length > 0) {
                // Step 2: اس نمبر سے منسلک CNIC تلاش کریں
                fetchedCNIC = initialData[0].CNIC || initialData[0].cnic;

                if (fetchedCNIC) {
                    // Step 3: اس CNIC کو استعمال کرتے ہوئے اس شحص کے تمام نمبرز (Multi Data) نکالیں
                    simDataResult = await getSIMData(fetchedCNIC);
                } else {
                    simDataResult = initialData;
                }
            }
        }

        let multiData = [];
        let numbersList = [];

        if (simDataResult && Array.isArray(simDataResult)) {
            multiData = simDataResult.map(item => ({
                number: item.NUMBER || item.number || '',
                name: item.NAME || item.name || '',
                cnic: item.CNIC || item.cnic || '',
                address: item.ADRESS || item.address || item.ADDRESS || ''
            }));
            
            // تمام نکالے گئے نمبرز کی لسٹ
            numbersList = multiData.map(item => item.number).filter(Boolean);
        }

        // Step 4: تمام Multi Data والے نمبرز کے لیے Truecaller API ایک ساتھ (Parallel) چلائیں
        let truecallerResults = [];
        if (numbersList.length > 0) {
            // سست روی اور Vercel Timeout سے بچنے کے لیے زیادہ سے زیادہ پہلے 7 نمبرز پر Truecaller چلائیں
            const limitedNumbers = numbersList.slice(0, 7);
            const promises = limitedNumbers.map(num => getTruecallerData(num));
            const results = await Promise.all(promises);
            truecallerResults = results.filter(item => item !== null);
        } else if (isNumber) {
            // اگر SIM ڈیٹا میں کچھ نہ ملے تو صرف اس نمبر کا Truecaller چیک کریں
            const tcData = await getTruecallerData(cleanNumber(cleanQuery));
            if (tcData) {
                truecallerResults.push(tcData);
            }
        }

        // Step 5: SIM Data اور Truecaller Data کو ملانا (Combined Data)
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
            extracted_cnic: fetchedCNIC || 'N/A',
            total_numbers_found: multiData.length,
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
        message: 'SIM Multi-Data & Truecaller Combined API',
        endpoints: {
            search: '/api/search?query=YOUR_NUMBER_OR_CNIC',
            health: '/api/health'
        },
        developer: 'Ramzan Ahsan',
        group: 'https://chat.whatsapp.com/LYqp196iG0E0H5QtPR3ogZ'
    });
});

// Local Testing
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Vercel Export
module.exports = app;
