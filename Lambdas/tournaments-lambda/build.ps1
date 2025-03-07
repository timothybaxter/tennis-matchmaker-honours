# Remove existing build directory and zip if they exist
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
Remove-Item auth-lambda.zip -ErrorAction SilentlyContinue

# Create build directory
New-Item -ItemType Directory -Force -Path build

# Copy source files
Copy-Item -Path "src\*" -Destination "build" -Recurse
Copy-Item -Path "package.json" -Destination "build"

# Change to build directory and install dependencies
Push-Location build
npm install --production

# Create ZIP file
Compress-Archive -Path * -DestinationPath ..\auth-lambda.zip -Force

# Clean up
Pop-Location
Remove-Item -Recurse -Force build