require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// CARGAMOS LAS CLAVES
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// RUTA PRINCIPAL: EL AUDITOR
app.post('/api/audit', async (req, res) => {
    try {
        const { businessName, city } = req.body;

        console.log(`🔎 Buscando: "${businessName}" en "${city}"...`);

        if (!businessName) {
            return res.status(400).json({ error: 'Falta el nombre del negocio.' });
        }

        // --- PASO 1: BUSCAR EL ID EN GOOGLE ---
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
                message: "ALERTA CRÍTICA: Tu negocio NO aparece en Google Maps. Eres invisible para los clientes nuevos."
            });
        }

        const placeId = places[0].id;

        // --- PASO 2: EXTRAER DETALLES (AHORA INCLUYENDO 'types') ---
        const detailsResponse = await axios.get(
            `https://places.googleapis.com/v1/places/${placeId}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
                    // AGREGAMOS 'types' PARA SABER SI ES SERVICIO O PRODUCTO
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
            rating: data.rating || "N/A",
            reviews: data.userRatingCount || 0,
            categorias: data.types || [], // Aquí están las pistas (ej: 'dentist', 'restaurant')
            mapa_oficial: data.googleMapsUri
        };

        // --- PASO 3: ANÁLISIS DE VENTA (WHATSAPP + CALENDARIO) ---
        const prompt = `
            Actúa como un Auditor de Marketing Digital agresivo de "Soy Nexo".
            Analiza estos datos REALES extraídos de Google Maps:
            ${JSON.stringify(businessData)}

            Tus instrucciones OBLIGATORIAS para el reporte:

            1. 🕵️ **DETECTA EL TIPO DE NEGOCIO (Producto vs Servicio):**
               - Mira el campo "categorias".
               - Si ves palabras como: 'health', 'lawyer', 'dentist', 'gym', 'repair', 'salon', 'consultant', 'school' -> ES SERVICIO.
               - Si ves palabras como: 'store', 'restaurant', 'food', 'market', 'shop' -> ES PRODUCTO.

            2. 📅 **ANÁLISIS DE CALENDARIO (Solo si es Servicio):**
               - Si detectaste que es SERVICIO: Busca si tiene sitio web. Si no tiene web o sistema de reservas visible, GRITA: "¡Estás perdiendo citas! Tu negocio es de SERVICIOS, necesitas un CALENDARIO AUTOMATIZADO. Tus clientes quieren agendar a las 11 PM sin hablar con nadie."

            3. 📱 **ANÁLISIS DE WHATSAPP:**
               - Si "telefono" es "NO_TIENE": Alerta roja.
               - Si TIENE teléfono: "¿Ese número ${businessData.telefono} es un Bot Inteligente? Si respondes manualmente, eres lento. Necesitas automatización."

            4. ⭐ **REPUTACIÓN:**
               - Si tiene pocas reseñas (<20), dile que su competencia lo aplasta.

            5. **FORMATO:**
               - Sé breve, usa emojis de alerta (⚠️, 📅, 🤖) y genera urgencia de venta.
               - Responde en formato HTML simple (usa <b>, <br>).
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o",
        });

        const auditReport = completion.choices[0].message.content;

        // --- PASO 4: RESPONDER ---
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
    console.log(`🚀 NexoBot (Cerebro) escuchando en puerto ${PORT}`);
});