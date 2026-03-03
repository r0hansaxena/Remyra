// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IXcmPrecompile.sol";
import "./FXOracle.sol";

/**
 * @title Remyra
 * @notice Cross-chain stablecoin remittance engine on Polkadot Hub
 * @dev This contract demonstrates all 3 Track 2 PVM categories:
 *      1. PVM-experiments: Uses FXOracle (Rust library architecture) for FX rate calculations
 *      2. Native Assets: Handles USDT/USDC on Polkadot Asset Hub as native settlement tokens
 *      3. Precompiles: Uses XCM precompile for cross-chain transfers to parachains
 *
 *      Remyra enables sub-1% fee international remittances by leveraging Polkadot's
 *      native cross-chain messaging (XCM) and native asset infrastructure.
 */
contract Remyra is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- State ---

    /// @notice FX Oracle for rate calculations
    FXOracle public oracle;

    /// @notice XCM Precompile for cross-chain transfers
    IXcmPrecompile public constant XCM_PRECOMPILE =
        IXcmPrecompile(0x0000000000000000000000000000000000000803);

    /// @notice Supported stablecoins
    mapping(address => bool) public supportedTokens;
    address[] public tokenList;

    /// @notice Token symbol mapping for FX oracle lookups
    mapping(address => string) public tokenSymbol;

    /// @notice Remittance record
    struct Remittance {
        uint256 id;
        address sender;
        address recipient;
        address tokenIn;
        uint256 amountIn;
        uint256 amountOut;
        uint256 fee;
        uint32 destChainId;
        string destCurrency;
        uint256 timestamp;
        RemittanceStatus status;
    }

    enum RemittanceStatus {
        Pending,
        Completed,
        CrossChainSent,
        Failed
    }

    /// @notice All remittances by ID
    mapping(uint256 => Remittance) public remittances;
    uint256 public nextRemittanceId;

    /// @notice User remittance history
    mapping(address => uint256[]) public userRemittances;

    /// @notice Liquidity pool balances per token
    mapping(address => uint256) public liquidityPool;

    /// @notice Total volume processed
    uint256 public totalVolumeUSD;

    /// @notice Total fees collected
    uint256 public totalFeesCollected;

    /// @notice Total remittances count
    uint256 public totalRemittances;

    // --- Events ---

    event RemittanceSent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee,
        uint32 destChainId
    );

    event RemittanceCompleted(uint256 indexed id);

    event CrossChainTransferInitiated(
        uint256 indexed remittanceId,
        uint32 indexed destChainId,
        bytes xcmMessage
    );

    event LiquidityAdded(address indexed token, address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed token, address indexed provider, uint256 amount);
    event TokenAdded(address indexed token, string symbol);

    // --- Constructor ---

    constructor(address _oracle) Ownable(msg.sender) {
        oracle = FXOracle(_oracle);
    }

    // --- Core Functions ---

    function sendRemittance(
        address tokenIn,
        uint256 amount,
        address recipient,
        string calldata destCurrency
    ) external nonReentrant returns (uint256 remittanceId) {
        require(supportedTokens[tokenIn], "Remyra: token not supported");
        require(amount > 0, "Remyra: zero amount");
        require(recipient != address(0), "Remyra: zero recipient");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        string memory fromSymbol = tokenSymbol[tokenIn];
        (uint256 amountOut, uint256 fee) = oracle.convert(fromSymbol, destCurrency, amount);

        remittanceId = nextRemittanceId++;
        remittances[remittanceId] = Remittance({
            id: remittanceId,
            sender: msg.sender,
            recipient: recipient,
            tokenIn: tokenIn,
            amountIn: amount,
            amountOut: amountOut,
            fee: fee,
            destChainId: 0,
            destCurrency: destCurrency,
            timestamp: block.timestamp,
            status: RemittanceStatus.Completed
        });

        userRemittances[msg.sender].push(remittanceId);

        uint256 transferAmount = amount - fee;
        IERC20(tokenIn).safeTransfer(recipient, transferAmount);

        liquidityPool[tokenIn] += fee;
        totalFeesCollected += fee;
        totalVolumeUSD += amount;
        totalRemittances++;

        emit RemittanceSent(remittanceId, msg.sender, recipient, tokenIn, amount, amountOut, fee, 0);
        emit RemittanceCompleted(remittanceId);
    }

    function sendCrossChainRemittance(
        address tokenIn,
        uint256 amount,
        address recipient,
        uint32 destChainId,
        string calldata destCurrency
    ) external nonReentrant returns (uint256 remittanceId) {
        require(supportedTokens[tokenIn], "Remyra: token not supported");
        require(amount > 0, "Remyra: zero amount");
        require(recipient != address(0), "Remyra: zero recipient");
        require(destChainId > 0, "Remyra: invalid chain ID");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        string memory fromSymbol = tokenSymbol[tokenIn];
        (uint256 amountOut, uint256 fee) = oracle.convert(fromSymbol, destCurrency, amount);

        remittanceId = nextRemittanceId++;
        remittances[remittanceId] = Remittance({
            id: remittanceId,
            sender: msg.sender,
            recipient: recipient,
            tokenIn: tokenIn,
            amountIn: amount,
            amountOut: amountOut,
            fee: fee,
            destChainId: destChainId,
            destCurrency: destCurrency,
            timestamp: block.timestamp,
            status: RemittanceStatus.CrossChainSent
        });

        userRemittances[msg.sender].push(remittanceId);

        bytes memory xcmMessage = _buildXcmTransferMessage(tokenIn, amount - fee, recipient, destChainId);
        bytes memory dest = _encodeParachainDest(destChainId);

        try XCM_PRECOMPILE.send(dest, xcmMessage) returns (bool success) {
            if (!success) {
                remittances[remittanceId].status = RemittanceStatus.Failed;
            }
        } catch {
            remittances[remittanceId].status = RemittanceStatus.Pending;
        }

        liquidityPool[tokenIn] += fee;
        totalFeesCollected += fee;
        totalVolumeUSD += amount;
        totalRemittances++;

        emit RemittanceSent(remittanceId, msg.sender, recipient, tokenIn, amount, amountOut, fee, destChainId);
        emit CrossChainTransferInitiated(remittanceId, destChainId, xcmMessage);
    }

    function addLiquidity(address token, uint256 amount) external nonReentrant {
        require(supportedTokens[token], "Remyra: token not supported");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        liquidityPool[token] += amount;
        emit LiquidityAdded(token, msg.sender, amount);
    }

    function removeLiquidity(address token, uint256 amount) external onlyOwner {
        require(liquidityPool[token] >= amount, "Remyra: insufficient liquidity");
        liquidityPool[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(token, msg.sender, amount);
    }

    // --- View Functions ---

    function getRemittance(uint256 id) external view returns (Remittance memory) {
        return remittances[id];
    }

    function getUserRemittances(address user) external view returns (uint256[] memory) {
        return userRemittances[user];
    }

    function getUserRemittanceCount(address user) external view returns (uint256) {
        return userRemittances[user].length;
    }

    function estimateRemittance(
        address tokenIn,
        uint256 amount,
        string calldata destCurrency
    ) external view returns (uint256 amountOut, uint256 fee) {
        string memory fromSymbol = tokenSymbol[tokenIn];
        return oracle.convert(fromSymbol, destCurrency, amount);
    }

    function getStats() external view returns (
        uint256 volume, uint256 fees, uint256 remittanceCount, uint256 supportedTokenCount
    ) {
        return (totalVolumeUSD, totalFeesCollected, totalRemittances, tokenList.length);
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return tokenList;
    }

    // --- Admin ---

    function addToken(address token, string calldata symbol) external onlyOwner {
        require(!supportedTokens[token], "Remyra: token already added");
        supportedTokens[token] = true;
        tokenSymbol[token] = symbol;
        tokenList.push(token);
        emit TokenAdded(token, symbol);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = FXOracle(_oracle);
    }

    // --- Internal XCM Helpers ---

    function _buildXcmTransferMessage(
        address token, uint256 amount, address recipient, uint32 destChainId
    ) internal pure returns (bytes memory) {
        return abi.encode("XCM_TRANSFER", token, amount, recipient, destChainId);
    }

    function _encodeParachainDest(uint32 parachainId) internal pure returns (bytes memory) {
        return abi.encode("PARACHAIN", parachainId);
    }
}
