const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Optimistic Bridge Demo", function () {
  let sourceBridge;
  let targetBridge;

  let user;
  let relayer;
  let watcher;
  let receiver;

  let sourceChainId;
  let sourceBridgeAddress;

  const CHALLENGE_PERIOD = 60;

  beforeEach(async function () {
    [user, relayer, watcher, receiver] = await ethers.getSigners();

    const network = await ethers.provider.getNetwork();
    sourceChainId = network.chainId;

    const SourceBridge = await ethers.getContractFactory("SourceBridge");
    sourceBridge = await SourceBridge.deploy();
    await sourceBridge.waitForDeployment();

    sourceBridgeAddress = await sourceBridge.getAddress();

    const TargetBridge = await ethers.getContractFactory("TargetBridge");
    targetBridge = await TargetBridge.deploy(CHALLENGE_PERIOD);
    await targetBridge.waitForDeployment();
  });

  it("实验一：正常消息在挑战期结束后可以被最终确认", async function () {
    const sourceNonce = 1;
    const amount = 100n;
    const data = "normal cross-chain message";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, amount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        amount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    expect(await targetBridge.getStatus(messageId)).to.equal(1n);

    await time.increase(CHALLENGE_PERIOD + 1);

    await targetBridge.finalizeMessage(messageId);

    expect(await targetBridge.getStatus(messageId)).to.equal(3n);
  });

  it("实验二：恶意中继者提交错误消息，观察者可以发起挑战", async function () {
    const sourceNonce = 1;
    const realAmount = 100n;
    const fakeAmount = 999n;
    const data = "message changed by malicious relayer";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, realAmount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        fakeAmount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    const realSourceMessageHash = await sourceBridge.getMessageHash(sourceNonce);

    await targetBridge
      .connect(watcher)
      .challengeMessage(messageId, realSourceMessageHash);

    expect(await targetBridge.getStatus(messageId)).to.equal(2n);
  });

  it("实验三：如果观察者缺席，错误消息也可能被最终确认", async function () {
    const sourceNonce = 1;
    const realAmount = 100n;
    const fakeAmount = 999n;
    const data = "no watcher challenge";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, realAmount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        fakeAmount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    expect(await targetBridge.getStatus(messageId)).to.equal(1n);

    await time.increase(CHALLENGE_PERIOD + 1);

    await targetBridge.finalizeMessage(messageId);

    expect(await targetBridge.getStatus(messageId)).to.equal(3n);
  });

  it("边界测试一：挑战期未结束时，消息不能被最终确认", async function () {
    const sourceNonce = 1;
    const amount = 100n;
    const data = "cannot finalize before challenge period ends";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, amount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        amount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    await expect(
      targetBridge.finalizeMessage(messageId)
    ).to.be.revertedWith("challenge period is not over");

    expect(await targetBridge.getStatus(messageId)).to.equal(1n);
  });

  it("边界测试二：挑战期结束后，观察者不能再发起挑战", async function () {
    const sourceNonce = 1;
    const realAmount = 100n;
    const fakeAmount = 999n;
    const data = "challenge too late";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, realAmount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        fakeAmount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    const realSourceMessageHash = await sourceBridge.getMessageHash(sourceNonce);

    await time.increase(CHALLENGE_PERIOD + 1);

    await expect(
      targetBridge
        .connect(watcher)
        .challengeMessage(messageId, realSourceMessageHash)
    ).to.be.revertedWith("challenge period has ended");

    expect(await targetBridge.getStatus(messageId)).to.equal(1n);
  });

  it("边界测试三：被挑战成功的消息不能再被最终确认", async function () {
    const sourceNonce = 1;
    const realAmount = 100n;
    const fakeAmount = 999n;
    const data = "challenged message cannot be finalized";

    await sourceBridge
      .connect(user)
      .sendMessage(receiver.address, realAmount, data);

    await targetBridge
      .connect(relayer)
      .submitMessage(
        sourceChainId,
        sourceBridgeAddress,
        sourceNonce,
        user.address,
        receiver.address,
        fakeAmount,
        data
      );

    const messageId = await targetBridge.getMessageId(
      sourceChainId,
      sourceBridgeAddress,
      sourceNonce
    );

    const realSourceMessageHash = await sourceBridge.getMessageHash(sourceNonce);

    await targetBridge
      .connect(watcher)
      .challengeMessage(messageId, realSourceMessageHash);

    expect(await targetBridge.getStatus(messageId)).to.equal(2n);

    await time.increase(CHALLENGE_PERIOD + 1);

    await expect(
      targetBridge.finalizeMessage(messageId)
    ).to.be.revertedWith("message is not pending");

    expect(await targetBridge.getStatus(messageId)).to.equal(2n);
  });
});