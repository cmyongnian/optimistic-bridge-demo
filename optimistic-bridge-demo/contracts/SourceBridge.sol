// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract SourceBridge {
    uint256 public nonce;

    mapping(uint256 => bytes32) public messages;

    event MessageSent(
        uint256 indexed nonce,
        uint256 sourceChainId,
        address sourceBridge,
        address indexed sender,
        address indexed to,
        uint256 amount,
        string data,
        bytes32 messageHash
    );

    function sendMessage(
        address to,
        uint256 amount,
        string calldata data
    ) external returns (bytes32) {
        nonce++;

        bytes32 messageHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                nonce,
                msg.sender,
                to,
                amount,
                data
            )
        );

        messages[nonce] = messageHash;

        emit MessageSent(
            nonce,
            block.chainid,
            address(this),
            msg.sender,
            to,
            amount,
            data,
            messageHash
        );

        return messageHash;
    }

    function getMessageHash(
        uint256 messageNonce
    ) external view returns (bytes32) {
        return messages[messageNonce];
    }
}
