require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.post('/api/audit', async (req, res) => {
    try {
        const { businessName, city } = req.body;
        console.log(`🔎 Analizando finanzas de: "${businessName}" en "${city}"...`);

        if (!businessName) {
            return res.status(400).json({ error: 'Falta el nombre del negocio.' });
        }

        // --- 1. BUSQUEDA EN GOOGLE ---
        const searchResponse = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            { textQuery: `${businessName} en ${city || ''}` },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
                    'X-Goog-FieldMask': 'places.id'
                }
            }
        );

        const places = searchResponse.data.places;

        if (!places || places.length === 0) {
            return res.json({
                found: false,
                message: "🚫 <b>ALERTA CRÍTICA:</b> Tu negocio es INVISIBLE. No apareces en el mapa. <br>Pérdida estimada: <b>100% del tráfico digital.</b>"
            });
        }

        const placeId = places[0].id;

        // --- 2. EXTRACCIÓN DE DATOS ---
        const detailsResponse = await axios.get(
            `https://places.googleapis.com/v1/places/${placeId}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
                    'X-Goog-FieldMask': 'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,rating,userRatingCount,googleMapsUri,types'
                }
            }
        );

        const data = detailsResponse.data;
        const businessData = {
            nombre: data.displayName?.text,
            direccion: data.formattedAddress,
            telefono: data.internationalPhoneNumber || "NO_TIENE",
            web: data.websiteUri || "NO_TIENE",
            rating: data.rating || 0,
            reviews: data.userRatingCount || 0,
            categorias: data.types || [],
            mapa_oficial: data.googleMapsUri
        };

        // --- 3. EL CEREBRO FINANCIERO (NUEVO PROMPT) ---
        const prompt = `
            Eres el Auditor Financiero Senior de "Soy Nexo". Tu trabajo NO es saludar, es detectar FUGAS DE DINERO.
            
            Analiza estos datos REALES del negocio:
            ${JSON.stringify(businessData)}

            --- REGLAS DE CÁLCULO DE PÉRDIDAS (ESTIMACIÓN) ---
            1. Si "web" es "NO_TIENE": Pierden el 35% de clientes nuevos (nadie compra sin ver catálogo/menú).
            2. Si "telefono" es "NO_TIENE" o NO tienen Bot: Pierden el 25% (ventas nocturnas o clientes impacientes).
            3. Si "reviews" < 20: Pierden el 15% por desconfianza social.
            4. Si es SERVICIO (dentista, abogado, etc) y no tiene web: GRITA que necesitan agendar citas automáticas.

            --- INSTRUCCIONES DE RESPUESTA ---
            Genera un reporte agresivo y directo en HTML (usa <b>, <br>, <i>).
            
            Estructura obligatoria:
            1. 📉 <b>DIAGNÓSTICO DE FUGAS:</b> (Lista los errores graves).
            2. 💸 <b>VEREDICTO FINANCIERO:</b> "Calculo que estás dejando de ganar aproximadamente [CALCULA UN MONTO EN MXN ENTRE $10,000 Y $50,000 SEGÚN LOS ERRORES] al mes por no tener estas herramientas."
            3. 🤖 <b>LA SOLUCIÓN:</b> (Vende el Bot de WhatsApp y la Web de Soy Nexo como la única cura).
            4. Cierra con una pregunta desafiante: "¿Vas a seguir quemando ese dinero o lo arreglamos hoy?"

            Sé breve, duro y usa emojis de dinero y alerta. No saludes. Ve al grano.
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o",
        });

        const auditReport = completion.choices[0].message.content;

        res.json({
            success: true,
            found: true,
            data: businessData,
            ai_analysis: auditReport
        });

    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 NexoBot Financiero escuchando en puerto ${PORT}`);
});