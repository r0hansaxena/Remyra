// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IXcmPrecompile.sol";
import "./FXOracle.sol";

/**
 * @title RemitX
 * @notice Cross-chain stablecoin remittance engine on Polkadot Hub
 * @dev This contract demonstrates all 3 Track 2 PVM categories:
 *      1. PVM-experiments: Uses FXOracle (Rust library architecture) for FX rate calculations
 *      2. Native Assets: Handles USDT/USDC on Polkadot Asset Hub as native settlement tokens
 *      3. Precompiles: Uses XCM precompile for cross-chain transfers to parachains
 *
 *      RemitX enables sub-1% fee international remittances by leveraging Polkadot's
 *      native cross-chain messaging (XCM) and native asset infrastructure.
 */
contract RemitX is Ownable, ReentrancyGuard {
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
        uint32 destChainId;       // 0 = same chain, >0 = parachain ID
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

    /// @notice Total volume processed (for analytics)
    uint256 public totalVolumeUSD;

    /// @notice Total fees collected (for analytics)
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

    /**
     * @notice Send a remittance on the same chain
     * @param tokenIn Address of the input stablecoin
     * @param amount Amount to send (in token's smallest unit)
     * @param recipient Recipient address
     * @param destCurrency Destination currency code for FX calculation
     */
    function sendRemittance(
        address tokenIn,
        uint256 amount,
        address recipient,
        string calldata destCurrency
    ) external nonReentrant returns (uint256 remittanceId) {
        require(supportedTokens[tokenIn], "RemitX: token not supported");
        require(amount > 0, "RemitX: zero amount");
        require(recipient != address(0), "RemitX: zero recipient");

        // Transfer tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate conversion via FX oracle
        string memory fromSymbol = tokenSymbol[tokenIn];
        (uint256 amountOut, uint256 fee) = oracle.convert(fromSymbol, destCurrency, amount);

        // Create remittance record
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

        // Transfer to recipient (minus fee)
        uint256 transferAmount = amount - fee;
        IERC20(tokenIn).safeTransfer(recipient, transferAmount);

        // Collect fee into liquidity pool
        liquidityPool[tokenIn] += fee;
        totalFeesCollected += fee;
        totalVolumeUSD += amount;
        totalRemittances++;

        emit RemittanceSent(
            remittanceId,
            msg.sender,
            recipient,
            tokenIn,
            amount,
            amountOut,
            fee,
            0
        );
        emit RemittanceCompleted(remittanceId);
    }

    /**
     * @notice Send a cross-chain remittance via XCM
     * @dev PVM Track 2 Category: Precompiles for native functionality
     *      Uses the XCM precompile to send assets cross-chain to parachains
     * @param tokenIn Address of the input stablecoin
     * @param amount Amount to send
     * @param recipient Recipient address on destination chain
     * @param destChainId Destination parachain ID
     * @param destCurrency Destination currency code
     */
    function sendCrossChainRemittance(
        address tokenIn,
        uint256 amount,
        address recipient,
        uint32 destChainId,
        string calldata destCurrency
    ) external nonReentrant returns (uint256 remittanceId) {
        require(supportedTokens[tokenIn], "RemitX: token not supported");
        require(amount > 0, "RemitX: zero amount");
        require(recipient != address(0), "RemitX: zero recipient");
        require(destChainId > 0, "RemitX: invalid chain ID");

        // Transfer tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate conversion
        string memory fromSymbol = tokenSymbol[tokenIn];
        (uint256 amountOut, uint256 fee) = oracle.convert(fromSymbol, destCurrency, amount);

        // Create remittance record
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

        // Build XCM message for cross-chain transfer
        // The XCM message encodes: WithdrawAsset, BuyExecution, DepositAsset
        bytes memory xcmMessage = _buildXcmTransferMessage(
            tokenIn,
            amount - fee,
            recipient,
            destChainId
        );

        // Send via XCM precompile
        bytes memory dest = _encodeParachainDest(destChainId);

        // Note: On local testnet, XCM precompile may not be available
        // In production on Polkadot Hub, this calls the real XCM precompile
        try XCM_PRECOMPILE.send(dest, xcmMessage) returns (bool success) {
            if (!success) {
                remittances[remittanceId].status = RemittanceStatus.Failed;
            }
        } catch {
            // XCM precompile not available (e.g., local testnet)
            // Mark as pending for manual processing
            remittances[remittanceId].status = RemittanceStatus.Pending;
        }

        // Collect fee
        liquidityPool[tokenIn] += fee;
        totalFeesCollected += fee;
        totalVolumeUSD += amount;
        totalRemittances++;

        emit RemittanceSent(
            remittanceId,
            msg.sender,
            recipient,
            tokenIn,
            amount,
            amountOut,
            fee,
            destChainId
        );
        emit CrossChainTransferInitiated(remittanceId, destChainId, xcmMessage);
    }

    /**
     * @notice Add liquidity to the remittance pool
     * @param token Token address
     * @param amount Amount to add
     */
    function addLiquidity(address token, uint256 amount) external nonReentrant {
        require(supportedTokens[token], "RemitX: token not supported");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        liquidityPool[token] += amount;
        emit LiquidityAdded(token, msg.sender, amount);
    }

    /**
     * @notice Withdraw liquidity from the pool (owner only)
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function removeLiquidity(address token, uint256 amount) external onlyOwner {
        require(liquidityPool[token] >= amount, "RemitX: insufficient liquidity");
        liquidityPool[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit LiquidityRemoved(token, msg.sender, amount);
    }

    // --- View Functions ---

    /**
     * @notice Get remittance details
     */
    function getRemittance(uint256 id) external view returns (Remittance memory) {
        return remittances[id];
    }

    /**
     * @notice Get all remittance IDs for a user
     */
    function getUserRemittances(address user) external view returns (uint256[] memory) {
        return userRemittances[user];
    }

    /**
     * @notice Get the number of remittances for a user
     */
    function getUserRemittanceCount(address user) external view returns (uint256) {
        return userRemittances[user].length;
    }

    /**
     * @notice Estimate remittance output and fee
     * @param tokenIn Input token address
     * @param amount Input amount
     * @param destCurrency Destination currency code
     * @return amountOut Estimated output
     * @return fee Estimated fee
     */
    function estimateRemittance(
        address tokenIn,
        uint256 amount,
        string calldata destCurrency
    ) external view returns (uint256 amountOut, uint256 fee) {
        string memory fromSymbol = tokenSymbol[tokenIn];
        return oracle.convert(fromSymbol, destCurrency, amount);
    }

    /**
     * @notice Get protocol statistics
     */
    function getStats() external view returns (
        uint256 volume,
        uint256 fees,
        uint256 remittanceCount,
        uint256 supportedTokenCount
    ) {
        return (totalVolumeUSD, totalFeesCollected, totalRemittances, tokenList.length);
    }

    /**
     * @notice Get all supported token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return tokenList;
    }

    // --- Admin ---

    /**
     * @notice Add a supported token
     * @param token Token contract address
     * @param symbol Currency symbol (e.g., "USDT")
     */
    function addToken(address token, string calldata symbol) external onlyOwner {
        require(!supportedTokens[token], "RemitX: token already added");
        supportedTokens[token] = true;
        tokenSymbol[token] = symbol;
        tokenList.push(token);
        emit TokenAdded(token, symbol);
    }

    /**
     * @notice Update the FX oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        oracle = FXOracle(_oracle);
    }

    // --- Internal XCM Helpers ---

    /**
     * @notice Build an XCM transfer message
     * @dev Encodes WithdrawAsset + ClearOrigin + BuyExecution + DepositAsset
     */
    function _buildXcmTransferMessage(
        address token,
        uint256 amount,
        address recipient,
        uint32 destChainId
    ) internal pure returns (bytes memory) {
        // XCM V3 message structure (simplified for hackathon)
        // In production, this would be fully SCALE-encoded XCM
        return abi.encode(
            "XCM_TRANSFER",
            token,
            amount,
            recipient,
            destChainId
        );
    }

    /**
     * @notice Encode a parachain destination as multilocation
     */
    function _encodeParachainDest(uint32 parachainId) internal pure returns (bytes memory) {
        // SCALE-encoded multilocation: { parents: 1, interior: X1(Parachain(id)) }
        // Simplified for hackathon
        return abi.encode("PARACHAIN", parachainId);
    }
}
