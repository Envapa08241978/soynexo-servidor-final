    // ACTUALIZACION FORZOSA PORTERO.
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
            
            console.log(`🧠 Recibido: "${businessName}" - Iniciando análisis...`);

            // --- PASO 0: EL PORTERO INTELIGENTE (FILTRO DE INTENCIÓN) ---
            // Verificamos si es saludo o búsqueda, tolerando errores de ortografía.
            const intentCheck = await openai.chat.completions.create({
                messages: [{ 
                    role: "system", 
                    content: `
                        Eres un clasificador de intención para el bot "Soy Nexo".
                        Tu trabajo es decidir si el texto del usuario es una BÚSQUEDA DE NEGOCIO o una CHARLA CASUAL.
                        
                        SI ES CHARLA (Hola, gracias, adiós, quién eres, precio, qué haces, groserías):
                        Responde con un JSON: {"type": "CHAT", "reply": "Tu respuesta corta y amable invitando a auditar un negocio (Ej: 'Hola 👋 Soy la IA de Nexo. Dime el nombre de tu negocio para auditarlo')."}
                        
                        SI ES BÚSQUEDA (Nombre de negocio, "tacos...", "dentista en...", "tienda..."):
                        NOTA IMPORTANTE: Los usuarios pueden tener mala ortografía (ej: "piza", "taxos", "pajiente"). SI PARECE UN NOMBRE O INTENTO DE BÚSQUEDA, ES "SEARCH".
                        Responde con un JSON: {"type": "SEARCH"}

                        Texto del usuario: "${businessName}"
                    `
                }],
                model: "gpt-4o-mini", // Modelo rápido y barato para esta tarea
                response_format: { type: "json_object" }
            });

            const intent = JSON.parse(intentCheck.choices[0].message.content);

            // SI ES SOLO CHARLA, RESPONDEMOS AQUÍ Y CORTAMOS EL PROCESO
            if (intent.type === "CHAT") {
                return res.json({
                    success: true,
                    found: false, // No activamos mapa
                    ai_analysis: intent.reply, // Devolvemos la respuesta amable
                    is_chat: true // Bandera para que el frontend sepa que no es auditoría
                });
            }

            // --- SI PASA EL PORTERO, EJECUTAMOS LA AUDITORÍA ---
            console.log(`🔎 Intención de búsqueda válida. Consultando Google Maps...`);

            // 1. BUSQUEDA EN GOOGLE
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
                    message: "🚫 No encontré ese negocio en el mapa. Intenta ser más específico (ej: 'Tacos El Pariente en Navojoa')."
                });
            }

            const placeId = places[0].id;

            // 2. EXTRACCIÓN DE DATOS DETALLADOS
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

            // 3. EL CEREBRO FINANCIERO (AUDITORIA CON CÁLCULO DE PÉRDIDAS)
            const auditPrompt = `
                Eres el Auditor Financiero Senior de "Soy Nexo". Tu objetivo es VENDER la solución detectando dinero perdido.
                
                Analiza estos datos REALES del negocio: ${JSON.stringify(businessData)}

                --- REGLAS DE CÁLCULO DE PÉRDIDAS (ESTIMACIÓN MXN) ---
                1. Si "web" es "NO_TIENE": Estima una pérdida de $15,000 a $25,000 MXN mensuales (clientes que se van a la competencia por no ver catálogo).
                2. Si "telefono" es "NO_TIENE": Estima pérdida de $10,000 MXN (nadie puede llamar).
                3. Si tiene teléfono pero NO tiene Bot (asume que no tiene): Adviértele que pierde ventas nocturnas.
                4. Si "reviews" < 20: Desconfianza social, pérdida del 15% de flujo.
                5. Si es SERVICIO (dentista, abogado, etc) y no tiene web: GRITA que necesitan agendar citas automáticas.

                --- INSTRUCCIONES DE RESPUESTA ---
                Genera un reporte agresivo, profesional y directo en HTML (usa <b>, <br>, <i>).
                
                Estructura obligatoria:
                1. 📉 <b>DIAGNÓSTICO DE FUGAS:</b> (Lista los errores graves detectados).
                2. 💸 <b>VEREDICTO FINANCIERO:</b> "Calculo que estás dejando de ganar aproximadamente [PON UN MONTO EN PESOS MXN] al mes por estas fallas."
                3. 🤖 <b>LA SOLUCIÓN:</b> "El Chatbot IA y la Web de Soy Nexo cierran estas fugas hoy mismo."
                4. Cierra con una pregunta desafiante: "¿Vas a seguir perdiendo ese dinero o lo recuperamos?"

                Sé breve, duro y usa emojis de dinero y alerta. No saludes (el portero ya saludó). Ve directo al dinero.
            `;

            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: auditPrompt }],
                model: "gpt-4o",
            });

            const auditReport = completion.choices[0].message.content;

            // 4. RESPUESTA FINAL AL CLIENTE
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
        console.log(`🚀 NexoBot (Portero + Auditor) escuchando en puerto ${PORT}`);
    });