import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Remyra", function () {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let mockUSDT: any;
    let mockUSDC: any;
    let fxOracle: any;
    let remyra: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    let owner: HardhatEthersSigner;
    let sender: HardhatEthersSigner;
    let recipient: HardhatEthersSigner;

    beforeEach(async function () {
        [owner, sender, recipient] = await ethers.getSigners();

        const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
        mockUSDT = await MockStablecoin.deploy("Mock USDT", "USDT", 6);
        mockUSDC = await MockStablecoin.deploy("Mock USDC", "USDC", 6);

        const FXOracle = await ethers.getContractFactory("FXOracle");
        fxOracle = await FXOracle.deploy();

        const Remyra = await ethers.getContractFactory("Remyra");
        remyra = await Remyra.deploy(await fxOracle.getAddress());

        await remyra.addToken(await mockUSDT.getAddress(), "USDT");
        await remyra.addToken(await mockUSDC.getAddress(), "USDC");

        const mintAmount = ethers.parseUnits("10000", 6);
        await mockUSDT.mint(sender.address, mintAmount);
        await mockUSDC.mint(sender.address, mintAmount);
    });

    describe("Deployment", function () {
        it("should deploy with correct oracle", async function () {
            expect(await remyra.oracle()).to.equal(await fxOracle.getAddress());
        });

        it("should have USDT and USDC as supported tokens", async function () {
            expect(await remyra.supportedTokens(await mockUSDT.getAddress())).to.be.true;
            expect(await remyra.supportedTokens(await mockUSDC.getAddress())).to.be.true;
        });

        it("should return correct supported tokens list", async function () {
            const tokens = await remyra.getSupportedTokens();
            expect(tokens.length).to.equal(2);
        });
    });

    describe("FX Oracle", function () {
        it("should return correct USD/INR rate", async function () {
            const [rate] = await fxOracle.getRate("USD", "INR");
            expect(rate).to.equal(ethers.parseUnits("83.5", 18));
        });

        it("should calculate conversion with fee", async function () {
            const amountIn = ethers.parseUnits("1000", 6);
            const [amountOut, fee] = await fxOracle.convert("USD", "INR", amountIn);
            expect(fee).to.be.gt(0);
            expect(amountOut).to.be.gt(0);
        });

        it("should calculate fee correctly (0.30%)", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const [fee, feeBps] = await fxOracle.calculateFee(amount);
            expect(feeBps).to.equal(30);
            expect(fee).to.equal(ethers.parseUnits("3", 5));
        });

        it("should revert on unsupported pair", async function () {
            await expect(fxOracle.getRate("USD", "XYZ")).to.be.revertedWith("FXOracle: pair not supported");
        });
    });

    describe("Same-chain Remittance", function () {
        it("should send a remittance successfully", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remyraAddress = await remyra.getAddress();

            await mockUSDT.connect(sender).approve(remyraAddress, amount);

            await expect(
                remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT")
            ).to.emit(remyra, "RemittanceSent");

            const remittance = await remyra.getRemittance(0);
            expect(remittance.sender).to.equal(sender.address);
            expect(remittance.recipient).to.equal(recipient.address);
            expect(remittance.amountIn).to.equal(amount);
            expect(remittance.status).to.equal(1);
        });

        it("should deduct fees correctly", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remyraAddress = await remyra.getAddress();

            await mockUSDT.connect(sender).approve(remyraAddress, amount);
            const recipientBalBefore = await mockUSDT.balanceOf(recipient.address);

            await remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");

            const recipientBalAfter = await mockUSDT.balanceOf(recipient.address);
            const received = recipientBalAfter - recipientBalBefore;
            const expectedFee = amount * 30n / 10000n;
            expect(received).to.equal(amount - expectedFee);
        });

        it("should track user remittance history", async function () {
            const amount = ethers.parseUnits("100", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remyraAddress = await remyra.getAddress();

            await mockUSDT.connect(sender).approve(remyraAddress, amount * 3n);

            await remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");
            await remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");
            await remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");

            const history = await remyra.getUserRemittances(sender.address);
            expect(history.length).to.equal(3);
        });
    });

    describe("Cross-chain Remittance", function () {
        it("should create cross-chain remittance record", async function () {
            const amount = ethers.parseUnits("500", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remyraAddress = await remyra.getAddress();

            await mockUSDT.connect(sender).approve(remyraAddress, amount);

            await remyra.connect(sender).sendCrossChainRemittance(
                usdtAddress, amount, recipient.address, 2004, "USDT"
            );

            const remittance = await remyra.getRemittance(0);
            expect(remittance.destChainId).to.equal(2004);
            expect(remittance.status).to.be.oneOf([0, 2]);
        });
    });

    describe("Protocol Statistics", function () {
        it("should track volume and fees", async function () {
            const amount = ethers.parseUnits("1000", 6);
            const usdtAddress = await mockUSDT.getAddress();
            const remyraAddress = await remyra.getAddress();

            await mockUSDT.connect(sender).approve(remyraAddress, amount);
            await remyra.connect(sender).sendRemittance(usdtAddress, amount, recipient.address, "USDT");

            const [volume, fees, count, tokenCount] = await remyra.getStats();
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

            const [amountOut, fee] = await remyra.estimateRemittance(usdtAddress, amount, "USDT");
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
