
/**
 * VetaCV AI™ - Static Web Server
 * 
 * This server serves the frontend files. 
 * Since we are using Supabase as the Backend-as-a-Service (BaaS), 
 * we no longer need complex API routes here.
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the root directory
// In a real production build, this would point to a 'dist' or 'build' folder
app.use(express.static(__dirname));

// Handle SPA routing: return index.html for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  🚀 VetaCV AI™ is running!
  
  ---------------------------------------
  Local:   http://localhost:${PORT}
  Backend: Supabase (Connected)
  ---------------------------------------
  `);
});
