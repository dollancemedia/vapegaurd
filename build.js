const { execSync } = require('child_process');
const path = require('path');

console.log('Building Vape Detection System (Backend/Vite) for Vercel...');

try {
  // Change to backend directory and build
  console.log('Building Vite frontend in backend/...');
  process.chdir(path.join(__dirname, 'backend'));
  execSync('npm install', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('✅ Build completed successfully!');
  console.log('📦 Frontend built in backend/dist/');
  console.log('🚀 Ready for Vercel deployment!');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}