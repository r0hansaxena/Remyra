// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IXcmPrecompile
 * @notice Interface for the Polkadot Hub XCM precompile at address 0x0000000000000000000000000000000000000803
 * @dev This interface allows Solidity contracts to perform cross-chain operations via XCM.
 *      On Polkadot Hub, this precompile enables cross-parachain asset transfers.
 *
 * PVM Track 2 Category: Precompiles for native functionality
 */
interface IXcmPrecompile {
    /**
     * @notice Execute an XCM message locally
     * @param message SCALE-encoded XCM VersionedXcm message
     * @param maxWeight Maximum weight for execution (ref_time, proof_size)
     * @return success Whether execution was successful
     */
    function execute(
        bytes calldata message,
        uint64 maxWeight
    ) external returns (bool success);

    /**
     * @notice Send an XCM message to another chain
     * @param dest SCALE-encoded multilocation of the destination
     * @param message SCALE-encoded XCM VersionedXcm message
     * @return success Whether sending was successful
     */
    function send(
        bytes calldata dest,
        bytes calldata message
    ) external returns (bool success);
}
