import * as React from "react";
import { hookSignatureKey } from "./constants.js";

const identity = (s) => s;

/**
 * 零分支 Hook 适配器：确保每种 Hook 来源拥有固定组件类型与恒定 Hook 顺序，
 * 杜绝条件/try-catch 调用 props.useChat / props.useSession / props.useInput 引发的 React #300/#310。
 */
function ChatViaUseChat(wrapperProps) {
  const snap = wrapperProps.__props.useChat(identity);
  return React.createElement(
    wrapperProps.__target,
    Object.assign({}, wrapperProps.__props, { _resolvedChatSnapshot: snap })
  );
}

function ChatViaUseSession(wrapperProps) {
  const sess = wrapperProps.__props.useSession(identity);
  const snap = sess && sess.chat ? sess.chat : sess;
  return React.createElement(
    wrapperProps.__target,
    Object.assign({}, wrapperProps.__props, { _resolvedChatSnapshot: snap })
  );
}

function ChatViaNone(wrapperProps) {
  const p = wrapperProps.__props;
  return React.createElement(
    wrapperProps.__target,
    Object.assign({}, p, { _resolvedChatSnapshot: (p && p.chatSnapshot) || null })
  );
}

function InputViaUseInput(wrapperProps) {
  const inputState = wrapperProps.__props.useInput(identity);
  return React.createElement(
    wrapperProps.__target,
    Object.assign({}, wrapperProps.__props, { _resolvedInputState: inputState })
  );
}

function InputViaProp(wrapperProps) {
  const p = wrapperProps.__props;
  return React.createElement(
    wrapperProps.__target,
    Object.assign({}, p, { _resolvedInputState: (p && p.inputState) || null })
  );
}

function InputGateThenTarget(props) {
  const hasInput = !!(props && typeof props.useInput === "function");
  const Adapter = hasInput ? InputViaUseInput : InputViaProp;
  const target = props.__finalTarget;
  const cleanProps = Object.assign({}, props);
  delete cleanProps.__finalTarget;
  const sig = hookSignatureKey(cleanProps, ["useInput"]);
  return React.createElement(Adapter, { key: sig, __target: target, __props: cleanProps });
}

/** 仅需 ChatSnapshot 的组件外层零 Hook 门卫（VersionPager / RecallBanner） */
export function renderWithChatGate(Target, props) {
  const hasChat = !!(props && typeof props.useChat === "function");
  const hasSession = !!(props && typeof props.useSession === "function");
  const Adapter = hasChat ? ChatViaUseChat : (hasSession ? ChatViaUseSession : ChatViaNone);
  const sig = hookSignatureKey(props, ["useChat", "useSession"]);
  return React.createElement(Adapter, { key: sig, __target: Target, __props: props });
}

/** 同时需要 ChatSnapshot 与 InputState 的组件外层零 Hook 门卫（UserBubbleView） */
export function renderWithChatAndInputGate(Target, props) {
  const forwarded = Object.assign({}, props, { __finalTarget: Target });
  return renderWithChatGate(InputGateThenTarget, forwarded);
}
