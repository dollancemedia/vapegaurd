const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const ARDUINO_CLI = path.join(__dirname, 'arduino-cli.exe');
const BOARD_FQBN = 'esp32:esp32:esp32c6';
const DEFAULT_PORT = 'COM3'; // Change this to your ESP32 port

// Available sketches
const SKETCHES = {
  'bme680-test': 'BME680_Custom_Test',
  'vape-sensor': 'esp32_vape_sensor',
  'zigbee-sensor': 'esp32_vape_sensor/Zigbee_Temp_Hum_Sensor_Sleepy',
  'esp32-test': 'ESP32_Test',
  'simple-debug': 'ESP32_Simple_Debug',
  'bme680-web': 'ESP32_BME680_Web_Server'
};

function showUsage() {
  console.log('\n🔧 Arduino ESP32-C6 Build Tool');
  console.log('\nUsage: node arduino-build.js <command> [options]');
  console.log('\nCommands:');
  console.log('  compile <sketch>     Compile sketch for ESP32-C6');
  console.log('  upload <sketch>      Compile and upload sketch');
  console.log('  list-ports          List available serial ports');
  console.log('  list-sketches       Show available sketches');
  console.log('\nSketches:');
  Object.keys(SKETCHES).forEach(key => {
    console.log(`  ${key.padEnd(15)} ${SKETCHES[key]}`);
  });
  console.log('\nOptions:');
  console.log('  --port <port>       Serial port (default: COM3)');
  console.log('  --verbose           Show detailed output');
  console.log('\nExamples:');
  console.log('  node arduino-build.js compile bme680-test');
  console.log('  node arduino-build.js upload vape-sensor --port COM5');
  console.log('  node arduino-build.js list-ports');
}

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      stdio: options.verbose ? 'inherit' : 'pipe',
      encoding: 'utf8'
    });
    return result;
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function compileSketch(sketchName, options = {}) {
  const sketchPath = SKETCHES[sketchName];
  if (!sketchPath) {
    console.error(`❌ Unknown sketch: ${sketchName}`);
    console.log('Available sketches:', Object.keys(SKETCHES).join(', '));
    process.exit(1);
  }

  if (!fs.existsSync(sketchPath)) {
    console.error(`❌ Sketch directory not found: ${sketchPath}`);
    process.exit(1);
  }

  console.log(`🔨 Compiling ${sketchName} (${sketchPath})...`);
  
  const compileCmd = `"${ARDUINO_CLI}" compile --fqbn ${BOARD_FQBN} "${sketchPath}"`;
  const result = runCommand(compileCmd, options);
  
  console.log('✅ Compilation successful!');
  if (!options.verbose && result) {
    const lines = result.split('\n');
    const memoryInfo = lines.filter(line => 
      line.includes('bytes') && (line.includes('program storage') || line.includes('dynamic memory'))
    );
    memoryInfo.forEach(line => console.log(`📊 ${line.trim()}`));
  }
}

function uploadSketch(sketchName, port, options = {}) {
  // First compile
  compileSketch(sketchName, options);
  
  const sketchPath = SKETCHES[sketchName];
  console.log(`📤 Uploading ${sketchName} to ${port}...`);
  
  const uploadCmd = `"${ARDUINO_CLI}" upload -p ${port} --fqbn ${BOARD_FQBN} "${sketchPath}"`;
  runCommand(uploadCmd, options);
  
  console.log('✅ Upload successful!');
  console.log(`🔌 Your ESP32-C6 on ${port} is now running ${sketchName}`);
}

function listPorts() {
  console.log('🔍 Scanning for serial ports...');
  const result = runCommand(`"${ARDUINO_CLI}" board list`);
  console.log(result);
}

function listSketches() {
  console.log('📁 Available sketches:');
  Object.entries(SKETCHES).forEach(([key, path]) => {
    const exists = fs.existsSync(path) ? '✅' : '❌';
    console.log(`  ${exists} ${key.padEnd(15)} ${path}`);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  showUsage();
  process.exit(0);
}

const command = args[0];
const sketchName = args[1];
const options = {
  verbose: args.includes('--verbose'),
  port: DEFAULT_PORT
};

// Parse port option
const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  options.port = args[portIndex + 1];
}

// Execute commands
switch (command) {
  case 'compile':
    if (!sketchName) {
      console.error('❌ Please specify a sketch name');
      showUsage();
      process.exit(1);
    }
    compileSketch(sketchName, options);
    break;
    
  case 'upload':
    if (!sketchName) {
      console.error('❌ Please specify a sketch name');
      showUsage();
      process.exit(1);
    }
    uploadSketch(sketchName, options.port, options);
    break;
    
  case 'list-ports':
    listPorts();
    break;
    
  case 'list-sketches':
    listSketches();
    break;
    
  default:
    console.error(`❌ Unknown command: ${command}`);
    showUsage();
    process.exit(1);
}