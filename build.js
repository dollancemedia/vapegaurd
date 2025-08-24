const { execSync } = require('child_process');
const path = require('path');

console.log('Building Vape Detection System for Vercel...');

try {
  // Change to frontend directory and build
  console.log('Building React frontend...');
  process.chdir(path.join(__dirname, 'frontend'));
  execSync('npm install', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('✅ Build completed successfully!');
  console.log('📦 Frontend built in frontend/build/');
  console.log('🚀 Ready for Vercel deployment!');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}