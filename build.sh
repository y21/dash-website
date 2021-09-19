# Assumes Rust, Git, NPM, Node is installed

echo '=== Cloning Git repository ==='
git clone https://github.com/y21/dash

echo '=== Building wasm binary ==='
cd dash/wasm
cargo b --release --target wasm32-unknown-unknown

echo '=== Moving binary ==='
git rev-parse HEAD > ../../public/assets/dash.rev
cd ../..
mv dash/wasm/target/wasm32-unknown-unknown/release/wasm.wasm public/assets/dash.wasm
rm -rf dash

npm install
npm run build

echo '=== Setup complete! ==='