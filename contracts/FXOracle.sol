// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FXOracle
 * @notice Foreign exchange rate oracle for RemitX remittance calculations
 * PVM Track 2 Category: PVM-experiments (Rust/C++ from Solidity)
 *
 * ARCHITECTURE NOTE:
 * In the full production version, this contract calls a Rust-based FX oracle
 * library compiled to PVM via the RISC-V toolchain. The Rust library provides:
 * - Manipulation-resistant FX rate aggregation from multiple data sources
 * - Optimal routing path calculation using graph algorithms (Dijkstra/Bellman-Ford)
 * - Statistical outlier detection for rate feed integrity
 *
 * For the hackathon MVP, the FX logic is implemented in Solidity to demonstrate
 * the contract interface and data flow. The Rust integration points are marked
 * with "PVM-RUST-CALL" comments throughout the code.
 *
 * Rust library signature (PVM):
 *   fn get_exchange_rate(from: &str, to: &str) -> u64
 *   fn calculate_optimal_route(input: u64, path: &[u8]) -> u64
 */
contract FXOracle is Ownable {
    /// @notice Exchange rate with 18 decimal precision
    struct Rate {
        uint256 rate;        // Rate with 18 decimals (1e18 = 1:1)
        uint256 updatedAt;   // Timestamp of last update
        bool active;         // Whether this pair is active
    }

    /// @notice Route for multi-hop transfers
    struct Route {
        address[] path;         // Token addresses in order
        uint256[] rates;        // FX rates for each hop
        uint256 estimatedOutput; // Estimated output amount
        uint256 totalFee;       // Total fee in basis points
    }

    /// @notice Currency pair key => Rate data
    mapping(bytes32 => Rate) public rates;

    /// @notice Supported currency pairs
    bytes32[] public supportedPairs;

    /// @notice Base fee in basis points (1 bp = 0.01%)
    uint256 public baseFee = 30; // 0.30% default

    /// @notice Events
    event RateUpdated(string indexed fromCurrency, string indexed toCurrency, uint256 rate);
    event BaseFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor() Ownable(msg.sender) {
        // Initialize with common remittance corridor rates
        // PVM-RUST-CALL: In production, these are fetched from the Rust oracle library
        _setRate("USD", "INR", 83_500000000000000000);   // 1 USD = 83.50 INR
        _setRate("USD", "PHP", 56_200000000000000000);   // 1 USD = 56.20 PHP
        _setRate("USD", "MXN", 17_150000000000000000);   // 1 USD = 17.15 MXN
        _setRate("USD", "NGN", 1_550_000000000000000000); // 1 USD = 1550 NGN
        _setRate("USD", "BRL", 4_970000000000000000);    // 1 USD = 4.97 BRL
        _setRate("USD", "GBP", 790000000000000000);      // 1 USD = 0.79 GBP
        _setRate("USD", "EUR", 920000000000000000);       // 1 USD = 0.92 EUR
        _setRate("USD", "KES", 129_500000000000000000);  // 1 USD = 129.50 KES
        _setRate("USDT", "USDC", 1_000000000000000000);  // 1:1 stablecoin peg
        _setRate("USDC", "USDT", 1_000000000000000000);  // 1:1 stablecoin peg
    }

    /**
     * @notice Get the exchange rate for a currency pair
     * @dev PVM-RUST-CALL: In production, this calls the Rust FX library
     * @param from Source currency code (e.g., "USD")
     * @param to Destination currency code (e.g., "INR")
     * @return rate Exchange rate with 18 decimals
     * @return updatedAt Timestamp of last rate update
     */
    function getRate(
        string calldata from,
        string calldata to
    ) external view returns (uint256 rate, uint256 updatedAt) {
        bytes32 key = _pairKey(from, to);
        Rate storage r = rates[key];
        require(r.active, "FXOracle: pair not supported");
        return (r.rate, r.updatedAt);
    }

    /**
     * @notice Calculate the output amount for a given input
     * @dev PVM-RUST-CALL: In production, the optimal route calculation
     *      uses a Rust Dijkstra implementation on PVM for performance
     * @param from Source currency code
     * @param to Destination currency code
     * @param amountIn Input amount (in source token smallest unit)
     * @return amountOut Output amount after conversion
     * @return fee Fee amount in source token units
     */
    function convert(
        string calldata from,
        string calldata to,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee) {
        bytes32 key = _pairKey(from, to);
        Rate storage r = rates[key];
        require(r.active, "FXOracle: pair not supported");

        // Calculate fee
        fee = (amountIn * baseFee) / 10_000;
        uint256 amountAfterFee = amountIn - fee;

        // Apply exchange rate
        // PVM-RUST-CALL: In production, this calculation happens in the Rust library
        // with higher precision fixed-point arithmetic
        amountOut = (amountAfterFee * r.rate) / 1e18;
    }

    /**
     * @notice Get the transfer fee for a given amount
     * @param amount Transfer amount
     * @return fee Fee in the same denomination
     * @return feeBps Fee in basis points
     */
    function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 feeBps) {
        feeBps = baseFee;
        fee = (amount * baseFee) / 10_000;
    }

    /**
     * @notice Update an exchange rate (owner only)
     * @param from Source currency code
     * @param to Destination currency code
     * @param rate New rate with 18 decimals
     */
    function setRate(
        string calldata from,
        string calldata to,
        uint256 rate
    ) external onlyOwner {
        _setRate(from, to, rate);
    }

    /**
     * @notice Update the base fee
     * @param newFee New fee in basis points
     */
    function setBaseFee(uint256 newFee) external onlyOwner {
        require(newFee <= 100, "FXOracle: fee too high"); // Max 1%
        emit BaseFeeUpdated(baseFee, newFee);
        baseFee = newFee;
    }

    /**
     * @notice Get all supported currency pairs
     * @return pairs Array of pair keys
     */
    function getSupportedPairs() external view returns (bytes32[] memory) {
        return supportedPairs;
    }

    /**
     * @notice Get number of supported pairs
     */
    function pairCount() external view returns (uint256) {
        return supportedPairs.length;
    }

    // --- Internal ---

    function _setRate(string memory from, string memory to, uint256 rate) internal {
        bytes32 key = _pairKey(from, to);
        bool isNew = !rates[key].active;

        rates[key] = Rate({
            rate: rate,
            updatedAt: block.timestamp,
            active: true
        });

        if (isNew) {
            supportedPairs.push(key);
        }

        emit RateUpdated(from, to, rate);
    }

    function _pairKey(string memory from, string memory to) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(from, "/", to));
    }
}
