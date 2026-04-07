import React, { useEffect, useLayoutEffect, useRef } from "react";
import {
  RetroScreen,
  createRetroScreenController
} from "react-retro-display-tty-ansi-ascii";

export * from "react-retro-display-tty-ansi-ascii";

const ROOT_CLASS = "retro-screen";
const ROOT_ALIAS_CLASS = "retro-lcd";
const CLASS_PREFIX = "retro-screen__";
const CLASS_ALIAS_PREFIX = "retro-lcd__";

function applyLegacyClassAliases(host) {
  if (!host) {
    return;
  }

  const root = host.querySelector(`.${ROOT_CLASS}`);
  if (!root) {
    return;
  }

  const nodes = [root, ...root.querySelectorAll("[class]")];
  for (const node of nodes) {
    const classNames = Array.from(node.classList);
    for (const className of classNames) {
      if (className === ROOT_CLASS) {
        node.classList.add(ROOT_ALIAS_CLASS);
        continue;
      }

      if (className.startsWith(CLASS_PREFIX)) {
        node.classList.add(`${CLASS_ALIAS_PREFIX}${className.slice(CLASS_PREFIX.length)}`);
      }
    }
  }
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function useLegacyRetroLcdClassAliases(hostRef) {
  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    applyLegacyClassAliases(host);
  }, []);
}

export const RetroLcd = (props) => {
  const hostRef = useRef(null);
  useLegacyRetroLcdClassAliases(hostRef);

  return React.createElement(
    "div",
    {
      ref: hostRef,
      style: { display: "contents" }
    },
    React.createElement(RetroScreen, props)
  );
};

export const createRetroLcdController = createRetroScreenController;
