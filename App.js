// --- VERSIÓN 4.0 FINAL (CON ETIQUETAS DE RASTREO) ---
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// CARGAMOS LAS CLAVES SECRETAS
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// RUTA PRINCIPAL: EL AUDITOR
app.post('/api/audit', async (req, res) => {
    try {
        const { businessName, city } = req.body;
        
        console.log(`🧠 (V4.0) Analizando: "${businessName}"`);

        // --- PASO 0: EL PORTERO INTELIGENTE (FILTRO DE INTENCIÓN) ---
        try {
            const intentCheck = await openai.chat.completions.create({
                messages: [{ 
                    role: "system", 
                    content: `
                        Eres el Portero del bot "Soy Nexo". Clasifica el texto del usuario.
                        
                        1. SI ES SALUDO O CHARLA (Hola, buenas, precio, info, gracias):
                        Responde JSON: {"type": "CHAT", "reply": "👋 (V4.0) Hola. Soy la IA de Nexo. Escribe el nombre de tu negocio para auditarlo."}
                        
                        2. SI ES BÚSQUEDA (Nombre de negocio, tacos, tienda, dentista):
                        Responde JSON: {"type": "SEARCH"}

                        Texto: "${businessName}"
                    `
                }],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" }
            });

            const intent = JSON.parse(intentCheck.choices[0].message.content);

            // SI ES CHARLA, CORTAMOS AQUÍ
            if (intent.type === "CHAT") {
                return res.json({
                    success: true,
                    found: false,
                    ai_analysis: intent.reply, 
                    is_chat: true 
                });
            }
        } catch (e) {
            console.error("Error en el portero, pasando a búsqueda directa...");
        }

        // --- SI PASA EL PORTERO, BUSCAMOS EN GOOGLE ---
        console.log(`🔎 (V4.0) Buscando en Google Maps...`);

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
                // ESTE MENSAJE ES LA PRUEBA DE FUEGO
                message: "🚫 (V4.0) No encontré ese negocio. Verifica el nombre." 
            });
        }

        const placeId = places[0].id;

        // 2. EXTRACCIÓN DE DATOS
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

        // 3. EL CEREBRO FINANCIERO
        const auditPrompt = `
            Eres el Auditor de "Soy Nexo".
            Datos: ${JSON.stringify(businessData)}
            
            Genera reporte HTML agresivo:
            1. 📉 <b>DIAGNÓSTICO (V4.0):</b> Fugas.
            2. 💸 <b>PÉRDIDA:</b> Calcula monto mensual perdido.
            3. 🤖 <b>SOLUCIÓN:</b> Vende el Chatbot.
            Cierre agresivo.
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: auditPrompt }],
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
        console.error("❌ Error V4.0:", error.message);
        res.status(500).json({ error: 'Error interno del servidor V4.0.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR V4.0 (PORTERO ACTIVO) LISTO EN PUERTO ${PORT}`);
});