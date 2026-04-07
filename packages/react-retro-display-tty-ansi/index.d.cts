import * as React from "react";
import type {
  RetroScreenController,
  RetroScreenGeometry,
  RetroScreenProps,
  createRetroScreenController,
} from "react-retro-display-tty-ansi-ascii";

export * from "react-retro-display-tty-ansi-ascii";

export type RetroLcdController = RetroScreenController;
export type RetroLcdGeometry = RetroScreenGeometry;
export type RetroLcdProps = RetroScreenProps;

export declare const createRetroLcdController: typeof createRetroScreenController;
export declare const RetroLcd: React.FC<RetroScreenProps>;

