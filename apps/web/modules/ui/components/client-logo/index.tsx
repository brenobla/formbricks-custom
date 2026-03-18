"use client";

import { Project } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { TLogo } from "@formbricks/types/styling";
import { cn } from "@/lib/cn";

interface ClientLogoProps {
  environmentId?: string;
  projectLogo: Project["logo"] | null;
  surveyLogo?: TLogo | null;
  previewSurvey?: boolean;
  dir?: "ltr" | "rtl" | "auto";
}

export const ClientLogo = ({
  environmentId,
  projectLogo,
  surveyLogo,
  previewSurvey = false,
  dir = "auto",
}: ClientLogoProps) => {
  const { t } = useTranslation();
  const logoToUse = surveyLogo?.url ? surveyLogo : projectLogo;
  const logoAlignment = (logoToUse as any)?.alignment || "left";
  const logoHeight = (logoToUse as any)?.height;

  let positionClasses = "";
  if (!previewSurvey) {
    if (dir === "rtl") {
      positionClasses = "top-3 right-3 md:top-7 md:right-7";
    } else {
      positionClasses = "top-3 left-3 md:top-7 md:left-7";
    }
  }

  const alignmentClass =
    logoAlignment === "center"
      ? "justify-center"
      : logoAlignment === "right"
        ? "justify-end"
        : "justify-start";

  return (
    <div
      className={cn(
        previewSurvey ? `flex w-full px-5 ${alignmentClass}` : positionClasses,
        !previewSurvey && "absolute",
        "group z-0 rounded-lg"
      )}
      style={{ backgroundColor: logoToUse?.bgColor }}>
      {previewSurvey && environmentId && (
        <Link
          href={`/environments/${environmentId}/workspace/look`}
          className="group/link absolute h-full w-full hover:cursor-pointer"
          target="_blank">
          <ArrowUpRight
            size={24}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform rounded-md bg-white/80 p-0.5 text-slate-700 opacity-0 transition-all duration-200 ease-in-out group-hover/link:opacity-100"
          />
        </Link>
      )}
      {logoToUse?.url ? (
        <Image
          src={logoToUse?.url}
          className={cn("w-auto object-contain p-1", previewSurvey ? "max-w-40" : "max-w-40 md:max-w-56")}
          style={{
            height: logoHeight
              ? `${previewSurvey ? Math.min(logoHeight, 48) : logoHeight}px`
              : previewSurvey
                ? "48px"
                : undefined,
            maxHeight: previewSurvey ? "48px" : logoHeight ? `${logoHeight}px` : "80px",
          }}
          width={256}
          height={logoHeight || 64}
          alt="Company Logo"
        />
      ) : (
        <Link
          href={`/environments/${environmentId}/workspace/look`}
          onClick={(e) => {
            if (!environmentId) {
              e.preventDefault();
            }
          }}
          className="whitespace-nowrap rounded-md border border-dashed border-slate-400 bg-slate-200 px-6 py-3 text-xs text-slate-900 opacity-50 backdrop-blur-sm hover:cursor-pointer hover:border-slate-600"
          target="_blank">
          {t("common.add_logo")}
        </Link>
      )}
    </div>
  );
};
