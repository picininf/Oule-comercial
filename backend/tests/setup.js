// Variáveis fictícias para os testes de regras puras (nenhuma chamada
// real ao Supabase/Pluggy/Gemini acontece nos testes).
process.env.SUPABASE_URL ||= 'https://teste.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste';
process.env.ALLOWED_ORIGINS ||= 'http://localhost:5173';
process.env.ADMIN_EMAIL ||= 'admin@teste.local';
