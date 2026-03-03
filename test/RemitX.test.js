const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RemitX", function () {
    let mockUSDT, mockUSDC, fxOracle, remitX;
    let owner, sender, recipient;

    beforeEach(async function () {
        [owner, sender, recipient] = await ethers.getSigners();

        // Deploy MockStablecoins
        const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
        mockUSDT = await MockStablecoin.deploy("Mock USDT", "USDT", 6);
        mockUSDC = await MockStablecoin.deploy("Mock USDC", "USDC", 6);

        // Deploy FXOracle
        const FXOracle = await ethers.getContractFactory("FXOracle");
        fxOracle = await FXOracle.deploy();

        // Deploy RemitX
        const RemitX = await ethers.getContractFactory("RemitX");
        remitX = await RemitX.deploy(await fxOracle.getAddress());

        // Configure RemitX
        await remitX.addToken(await mockUSDT.getAddress(), "USDT");
        await remitX.addToken(await mockUSDC.getAddress(), "USDC");

        // Mint tokens to sender
        const mintAmount = ethers.parseUnits("10000", 6);
        await mockUSDT.mint(sender.address, mintAmount);
        await mockUSDC.mint(sender.address, mintAmount);
    });

    describe("Deployment", function () {
        it("should deploy with correct oracle", async function () {
            expect(await remitX.oracle()).to.equal(await fxOracle.getAddress());
        });

        it("should have USDT and USDC as supported tokens", async function () {
            expect(await remitX.supportedTokens(await mockUSDT.getAddress())).to.be.true;
            expect(await remitX.supportedTokens(await mockUSDC.getAddress())).to.be.true;
        });

        it("should return correct supported tokens list", async function () {
            const tokens = await remitX.getSupportedTokens();
            expect(tokens.length).to.equal(2);
        });
    });

    describe("FX Oracle", function () {
        it("should return correct USD/INR rate", async function () {
            const [rate, _] = await fxOracle.getRate("USD", "INR");
            expect(rate).to.equal(ethers.parseUnits("83.5", 18));
        });

        it("should calculate conversion with fee", async function () {
            const amountIn = ethers.parseUnits("1000", 6); // $1000
            const [amountOut, fee] = await fxOracle.convert("USD", "INR", amountIn);
            expect(fee).to.be.gt(0);
            expect(amountOut).to.be.gt(0);
        });

        it("should calculate fee correctly (0.30%)", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const [fee, feeBps] = await fxOracle.calculateFee(amount);
            expect(feeBps).to.equal(30); // 30 bps
            expect(fee).to.equal(ethers.parseUnits("3", 5)); // $3 fee on $1000
        });

        it("should revert on unsupported pair", async function () {
            await expect(fxOracle.getRate("USD", "XYZ")).to.be.revertedWith(
                "FXOracle: pair not supported"
            );
        });
    });

    describe("Same-chain Remittance", function () {
        it("should send a remittance successfully", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remitXAddress = await remitX.getAddress();

            // Approve
            await mockUSDT.connect(sender).approve(remitXAddress, amount);

            // Send
            await expect(
                remitX.connect(sender).sendRemittance(
                    usdtAddress,
                    amount,
                    recipient.address,
                    "USDT"
                )
            ).to.emit(remitX, "RemittanceSent");

            // Check remittance was recorded
            const remittance = await remitX.getRemittance(0);
            expect(remittance.sender).to.equal(sender.address);
            expect(remittance.recipient).to.equal(recipient.address);
            expect(remittance.amountIn).to.equal(amount);
            expect(remittance.status).to.equal(1); // Completed
        });

        it("should deduct fees correctly", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remitXAddress = await remitX.getAddress();

            await mockUSDT.connect(sender).approve(remitXAddress, amount);

            const recipientBalBefore = await mockUSDT.balanceOf(recipient.address);

            await remitX.connect(sender).sendRemittance(
                usdtAddress,
                amount,
                recipient.address,
                "USDT"
            );

            const recipientBalAfter = await mockUSDT.balanceOf(recipient.address);
            const received = recipientBalAfter - recipientBalBefore;

            // Recipient should receive amount minus 0.3% fee
            const expectedFee = amount * 30n / 10000n;
            expect(received).to.equal(amount - expectedFee);
        });

        it("should track user remittance history", async function () {
            const amount = ethers.parseUnits("100", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remitXAddress = await remitX.getAddress();

            await mockUSDT.connect(sender).approve(remitXAddress, amount * 3n);

            await remitX.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");
            await remitX.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");
            await remitX.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");

            const history = await remitX.getUserRemittances(sender.address);
            expect(history.length).to.equal(3);
        });
    });

    describe("Cross-chain Remittance", function () {
        it("should create cross-chain remittance record", async function () {
            const amount = ethers.parseUnits("500", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remitXAddress = await remitX.getAddress();

            await mockUSDT.connect(sender).approve(remitXAddress, amount);

            await remitX.connect(sender).sendCrossChainRemittance(
                usdtAddress,
                amount,
                recipient.address,
                2004, // Moonbeam para ID
                "USDT"
            );

            const remittance = await remitX.getRemittance(0);
            expect(remittance.destChainId).to.equal(2004);
            // On local testnet, XCM precompile isn't available, so status will be Pending
            expect(remittance.status).to.be.oneOf([0, 2]); // Pending or CrossChainSent
        });
    });

    describe("Protocol Statistics", function () {
        it("should track volume and fees", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remitXAddress = await remitX.getAddress();

            await mockUSDT.connect(sender).approve(remitXAddress, amount);
            await remitX.connect(sender).sendRemittance(
                usdtAddress,
                amount,
                recipient.address,
                "USDT"
            );

            const [volume, fees, count, tokenCount] = await remitX.getStats();
            expect(volume).to.equal(amount);
            expect(fees).to.be.gt(0);
            expect(count).to.equal(1);
            expect(tokenCount).to.equal(2);
        });
    });

    describe("Estimation", function () {
        it("should estimate remittance output", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();

            const [amountOut, fee] = await remitX.estimateRemittance(
                usdtAddress,
                amount,
                "USDT"
            );

            expect(amountOut).to.be.gt(0);
            expect(fee).to.be.gt(0);
        });
    });

    describe("Mock Stablecoin", function () {
        it("should have 6 decimals", async function () {
            expect(await mockUSDT.decimals()).to.equal(6);
        });

        it("should allow faucet minting", async function () {
            const balBefore = await mockUSDT.balanceOf(recipient.address);
            await mockUSDT.connect(recipient).faucet();
            const balAfter = await mockUSDT.balanceOf(recipient.address);
            expect(balAfter - balBefore).to.equal(ethers.parseUnits("10000", 6));
        });
    });
});
