"use client";
import dynamic from "next/dynamic";
import { useState, useRef, memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import copy from "copy-to-clipboard";
import { FilePenLine, Save, Copy, CopyCheck } from "lucide-react";
import FloatingMenu from "@/components/Internal/FloatingMenu";
import { Button } from "@/components/Internal/Button";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/utils/style";

const Editor = dynamic(() => import("./Editor"));
const View = dynamic(() => import("./View"));

type Props = {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  hideTools?: boolean;
  allowImages?: boolean;
  fixedTopOffset?: number;
  fixedRightOffset?: number;
  tools?: ReactNode;
};

function MagicDown({
  value,
  onChange,
  className,
  hideTools,
  allowImages,
  fixedTopOffset,
  fixedRightOffset,
  tools,
}: Props) {
  const { t } = useTranslation();
  const isMobile = useMobile(450);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"editor" | "view">("view");
  const [waitingCopy, setWaitingCopy] = useState<boolean>(false);

  const handleCopy = () => {
    setWaitingCopy(true);
    copy(value);
    setTimeout(() => {
      setWaitingCopy(false);
    }, 1200);
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      {mode === "view" ? (
        <div className="magicdown-view prose prose-slate dark:prose-invert max-w-full">
          <View allowImages={allowImages}>{value}</View>
        </div>
      ) : (
        <div className="magicdown-editor my-2">
          <Editor defaultValue={value} onChange={onChange}></Editor>
        </div>
      )}
      {!hideTools ? (
        <FloatingMenu
          targetRef={containerRef}
          fixedTopOffset={fixedTopOffset ?? 16}
          fixedRightOffset={fixedRightOffset ?? (isMobile ? 0 : -70)}
        >
          <div className="flex flex-col gap-1 border rounded-full py-2 p-1 bg-white dark:bg-slate-800 max-sm:opacity-80 max-sm:hover:opacity-100 print:hidden">
            {mode === "view" ? (
              <Button
                className="float-menu-button"
                title={t("research.common.edit")}
                side="left"
                sideoffset={8}
                size="icon"
                variant="ghost"
                onClick={() => setMode("editor")}
              >
                <FilePenLine />
              </Button>
            ) : (
              <Button
                className="float-menu-button"
                title={t("research.common.save")}
                side="left"
                sideoffset={8}
                size="icon"
                variant="ghost"
                onClick={() => setMode("view")}
              >
                <Save />
              </Button>
            )}
            <Button
              className="float-menu-button"
              title={t("research.common.copy")}
              side="left"
              sideoffset={8}
              size="icon"
              variant="ghost"
              onClick={() => handleCopy()}
            >
              {waitingCopy ? (
                <CopyCheck className="h-full w-full text-green-500" />
              ) : (
                <Copy className="h-full w-full" />
              )}
            </Button>
            {tools ? tools : null}
          </div>
        </FloatingMenu>
      ) : null}
    </div>
  );
}

export default memo(MagicDown);
