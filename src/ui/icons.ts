import { createIcons, Download, Pause, Play, RotateCcw, Square, StepForward } from "lucide";

export function mountIcons() {
  createIcons({
    icons: {
      Download,
      Pause,
      Play,
      RotateCcw,
      Square,
      StepForward
    },
    attrs: {
      "aria-hidden": "true",
      width: "16",
      height: "16"
    }
  });
}
