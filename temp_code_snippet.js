
// --- Utility: Get Products Tool Handler ---
async function handleGetProducts(chatbot) {
    let products = [];

    // 1. External API (Priority)
    if (chatbot.external_product_api_url) {
        console.log(`[DEBUG] Fetching products from External API: ${chatbot.external_product_api_url}`);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s Timeout

            const headers = {};
            if (chatbot.external_product_api_key) {
                headers['Authorization'] = chatbot.external_product_api_key;
            }

            const response = await fetch(chatbot.external_product_api_url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                console.log(`[DEBUG] External API success. Found ${Array.isArray(data) ? data.length : 'unknown'} items.`);
                // Normalize data if needed, or hope AI understands it
                return JSON.stringify(data).substring(0, 5000); // Limit context size
            } else {
                console.error(`[DEBUG] External API Failed: ${response.status} ${response.statusText}`);
            }
        } catch (err) {
            console.error("[DEBUG] External API Error:", err.message);
        }
    }

    // 2. Internal Database Fallback
    console.log(`[DEBUG] Fetching products from Supabase...`);
    const { data: dbProducts, error } = await supabase
        .from('products')
        .select('name, description, unit_price, currency, qty') // Removed * to save tokens
        .eq('chatbot_id', chatbot.id)
        .limit(20); // Limit results for token efficiency

    if (error) {
        console.error("[DEBUG] Supabase Product Fetch Error:", error);
        return "Error fetching products.";
    }

    if (dbProducts && dbProducts.length > 0) {
        console.log(`[DEBUG] Found ${dbProducts.length} products in DB.`);
        return JSON.stringify(dbProducts);
    }

    return "No products found in inventory.";
}
