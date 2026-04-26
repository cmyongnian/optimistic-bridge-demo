// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TargetBridge {
    enum MessageStatus {
        None,
        Pending,
        Challenged,
        Finalized
    }

    struct BridgeMessage {
        uint256 sourceChainId;
        address sourceBridge;
        uint256 sourceNonce;
        address sender;
        address to;
        uint256 amount;
        string data;
        bytes32 submittedMessageHash;
        uint256 submittedAt;
        MessageStatus status;
    }

    uint256 public immutable challengePeriod;

    mapping(bytes32 => BridgeMessage) public messages;

    event MessageSubmitted(
        bytes32 indexed messageId,
        uint256 sourceChainId,
        address sourceBridge,
        uint256 sourceNonce,
        address sender,
        address to,
        uint256 amount,
        string data,
        bytes32 submittedMessageHash,
        uint256 submittedAt
    );

    event MessageChallenged(
        bytes32 indexed messageId,
        bytes32 submittedMessageHash,
        bytes32 realSourceMessageHash,
        address challenger
    );

    event MessageFinalized(
        bytes32 indexed messageId,
        address to,
        uint256 amount,
        string data
    );

    constructor(uint256 _challengePeriod) {
        require(
            _challengePeriod > 0,
            "challenge period must be greater than 0"
        );
        challengePeriod = _challengePeriod;
    }

    function getMessageId(
        uint256 sourceChainId,
        address sourceBridge,
        uint256 sourceNonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceChainId, sourceBridge, sourceNonce));
    }

    function computeMessageHash(
        uint256 sourceChainId,
        address sourceBridge,
        uint256 sourceNonce,
        address sender,
        address to,
        uint256 amount,
        string calldata data
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    sourceChainId,
                    sourceBridge,
                    sourceNonce,
                    sender,
                    to,
                    amount,
                    data
                )
            );
    }

    function submitMessage(
        uint256 sourceChainId,
        address sourceBridge,
        uint256 sourceNonce,
        address sender,
        address to,
        uint256 amount,
        string calldata data
    ) external returns (bytes32) {
        bytes32 messageId = getMessageId(
            sourceChainId,
            sourceBridge,
            sourceNonce
        );

        require(
            messages[messageId].status == MessageStatus.None,
            "message already submitted"
        );

        bytes32 submittedMessageHash = computeMessageHash(
            sourceChainId,
            sourceBridge,
            sourceNonce,
            sender,
            to,
            amount,
            data
        );

        messages[messageId] = BridgeMessage({
            sourceChainId: sourceChainId,
            sourceBridge: sourceBridge,
            sourceNonce: sourceNonce,
            sender: sender,
            to: to,
            amount: amount,
            data: data,
            submittedMessageHash: submittedMessageHash,
            submittedAt: block.timestamp,
            status: MessageStatus.Pending
        });

        emit MessageSubmitted(
            messageId,
            sourceChainId,
            sourceBridge,
            sourceNonce,
            sender,
            to,
            amount,
            data,
            submittedMessageHash,
            block.timestamp
        );

        return messageId;
    }

    function challengeMessage(
        bytes32 messageId,
        bytes32 realSourceMessageHash
    ) external {
        BridgeMessage storage bridgeMessage = messages[messageId];

        require(
            bridgeMessage.status == MessageStatus.Pending,
            "message is not pending"
        );

        require(
            block.timestamp < bridgeMessage.submittedAt + challengePeriod,
            "challenge period has ended"
        );

        require(
            realSourceMessageHash != bridgeMessage.submittedMessageHash,
            "submitted message is valid"
        );

        bridgeMessage.status = MessageStatus.Challenged;

        emit MessageChallenged(
            messageId,
            bridgeMessage.submittedMessageHash,
            realSourceMessageHash,
            msg.sender
        );
    }

    function finalizeMessage(bytes32 messageId) external {
        BridgeMessage storage bridgeMessage = messages[messageId];

        require(
            bridgeMessage.status == MessageStatus.Pending,
            "message is not pending"
        );

        require(
            block.timestamp >= bridgeMessage.submittedAt + challengePeriod,
            "challenge period is not over"
        );

        bridgeMessage.status = MessageStatus.Finalized;

        emit MessageFinalized(
            messageId,
            bridgeMessage.to,
            bridgeMessage.amount,
            bridgeMessage.data
        );
    }

    function getStatus(
        bytes32 messageId
    ) external view returns (MessageStatus) {
        return messages[messageId].status;
    }
}
