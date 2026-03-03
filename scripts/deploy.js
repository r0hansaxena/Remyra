const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

    // 1. Deploy Mock Stablecoins
    console.log("\n--- Deploying Mock Stablecoins ---");
    const MockStablecoin = await hre.ethers.getContractFactory("MockStablecoin");

    const mockUSDT = await MockStablecoin.deploy("Mock USDT", "USDT", 6);
    await mockUSDT.waitForDeployment();
    const usdtAddress = await mockUSDT.getAddress();
    console.log("MockUSDT deployed to:", usdtAddress);

    const mockUSDC = await MockStablecoin.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    const usdcAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);

    // 2. Deploy FX Oracle
    console.log("\n--- Deploying FX Oracle ---");
    const FXOracle = await hre.ethers.getContractFactory("FXOracle");
    const fxOracle = await FXOracle.deploy();
    await fxOracle.waitForDeployment();
    const oracleAddress = await fxOracle.getAddress();
    console.log("FXOracle deployed to:", oracleAddress);

    // 3. Deploy Remyra
    console.log("\n--- Deploying Remyra ---");
    const Remyra = await hre.ethers.getContractFactory("Remyra");
    const remyra = await Remyra.deploy(oracleAddress);
    await remyra.waitForDeployment();
    const remyraAddress = await remyra.getAddress();
    console.log("Remyra deployed to:", remyraAddress);

    // 4. Configure Remyra — add supported tokens
    console.log("\n--- Configuring Remyra ---");
    let tx = await remyra.addToken(usdtAddress, "USDT");
    await tx.wait();
    console.log("Added USDT as supported token");

    tx = await remyra.addToken(usdcAddress, "USDC");
    await tx.wait();
    console.log("Added USDC as supported token");

    // 5. Mint test tokens to deployer
    console.log("\n--- Minting test tokens ---");
    const mintAmount = hre.ethers.parseUnits("100000", 6);
    tx = await mockUSDT.mint(deployer.address, mintAmount);
    await tx.wait();
    console.log("Minted 100,000 USDT to deployer");

    tx = await mockUSDC.mint(deployer.address, mintAmount);
    await tx.wait();
    console.log("Minted 100,000 USDC to deployer");

    // Print summary
    console.log("\n========================================");
    console.log("  Remyra Deployment Summary");
    console.log("========================================");
    console.log(`  MockUSDT:  ${usdtAddress}`);
    console.log(`  MockUSDC:  ${usdcAddress}`);
    console.log(`  FXOracle:  ${oracleAddress}`);
    console.log(`  Remyra:    ${remyraAddress}`);
    console.log("========================================");

    const fs = require("fs");
    const deployment = {
        network: hre.network.name,
        contracts: {
            MockUSDT: usdtAddress,
            MockUSDC: usdcAddress,
            FXOracle: oracleAddress,
            Remyra: remyraAddress,
        },
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
    };

    fs.writeFileSync("./deployments.json", JSON.stringify(deployment, null, 2));
    console.log(`\nDeployment addresses saved to deployments.json`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
