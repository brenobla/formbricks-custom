"use client";

import { Project } from "@prisma/client";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TLogoAlignment, TLogoSize } from "@formbricks/types/styling";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { updateProjectAction } from "@/modules/projects/settings/actions";
import { handleFileUpload } from "@/modules/storage/file-upload";
import { AdvancedOptionToggle } from "@/modules/ui/components/advanced-option-toggle";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";
import { ColorPicker } from "@/modules/ui/components/color-picker";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import { FileInput } from "@/modules/ui/components/file-input";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";
import { showStorageNotConfiguredToast } from "@/modules/ui/components/storage-not-configured-toast/lib/utils";

interface EditLogoProps {
  project: Project;
  environmentId: string;
  isReadOnly: boolean;
  isStorageConfigured: boolean;
}

const LOGO_SIZES: { value: TLogoSize; label: string; px: string }[] = [
  { value: "small", label: "P", px: "40px" },
  { value: "medium", label: "M", px: "64px" },
  { value: "large", label: "G", px: "96px" },
];

const LOGO_ALIGNMENTS: { value: TLogoAlignment; icon: typeof AlignLeft }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

export const EditLogo = ({ project, environmentId, isReadOnly, isStorageConfigured }: EditLogoProps) => {
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState<string | undefined>(project.logo?.url || undefined);
  const [logoBgColor, setLogoBgColor] = useState<string | undefined>(project.logo?.bgColor || undefined);
  const [isBgColorEnabled, setIsBgColorEnabled] = useState<boolean>(!!project.logo?.bgColor);
  const [logoAlignment, setLogoAlignment] = useState<TLogoAlignment>(
    (project.logo as any)?.alignment || "center"
  );
  const [logoSize, setLogoSize] = useState<TLogoSize>((project.logo as any)?.size || "medium");
  const [logoHeight, setLogoHeight] = useState<number>((project.logo as any)?.height || 64);
  const [confirmRemoveLogoModalOpen, setConfirmRemoveLogoModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    setIsLoading(true);
    try {
      const uploadResult = await handleFileUpload(file, environmentId);
      if (uploadResult.error) {
        toast.error(uploadResult.error);
        return;
      }
      setLogoUrl(uploadResult.url);
    } catch (error) {
      toast.error(t("environments.workspace.look.logo_upload_failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!isStorageConfigured) {
      showStorageNotConfiguredToast();
      return;
    }
    const file = event.target.files?.[0];
    if (file) await handleImageUpload(file);
    setIsEditing(true);
  };

  const saveChanges = async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    setIsLoading(true);
    try {
      const updatedProject: Project["logo"] = {
        logo: {
          url: logoUrl,
          bgColor: isBgColorEnabled ? logoBgColor : undefined,
          alignment: logoAlignment,
          size: logoSize,
          height: logoHeight,
        },
      };
      const updateProjectResponse = await updateProjectAction({
        projectId: project.id,
        data: updatedProject,
      });
      if (updateProjectResponse?.data) {
        toast.success(t("environments.workspace.look.logo_updated_successfully"));
      } else {
        const errorMessage = getFormattedErrorMessage(updateProjectResponse);
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error(t("environments.workspace.look.failed_to_update_logo"));
    } finally {
      setIsEditing(false);
      setIsLoading(false);
    }
  };

  const removeLogo = async () => {
    setLogoUrl(undefined);
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    setIsLoading(true);
    try {
      const updatedProject: Project["logo"] = {
        logo: { url: undefined, bgColor: undefined },
      };
      const updateProjectResponse = await updateProjectAction({
        projectId: project.id,
        data: updatedProject,
      });
      if (updateProjectResponse?.data) {
        toast.success(t("environments.workspace.look.logo_removed_successfully"));
      } else {
        const errorMessage = getFormattedErrorMessage(updateProjectResponse);
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error(t("environments.workspace.look.failed_to_remove_logo"));
    } finally {
      setIsEditing(false);
      setIsLoading(false);
      setConfirmRemoveLogoModalOpen(false);
    }
  };

  const toggleBackgroundColor = (enabled: boolean) => {
    setIsBgColorEnabled(enabled);
    if (!enabled) {
      setLogoBgColor(undefined);
    } else if (!logoBgColor) {
      setLogoBgColor("#f8f8f8");
    }
  };

  const getPreviewAlignment = () => {
    if (logoAlignment === "center") return "justify-center";
    if (logoAlignment === "right") return "justify-end";
    return "justify-start";
  };

  return (
    <>
      <div className="w-full space-y-8" id="edit-logo">
        {logoUrl ? (
          <div className={`flex ${getPreviewAlignment()}`}>
            <Image
              src={logoUrl}
              alt="Logo"
              width={256}
              height={logoHeight}
              style={{
                backgroundColor: logoBgColor || undefined,
                height: `${logoHeight}px`,
                width: "auto",
              }}
              className="-mb-6 max-w-64 rounded-lg border object-contain p-1"
            />
          </div>
        ) : (
          <FileInput
            id="logo-input"
            allowedFileExtensions={["png", "jpeg", "jpg", "webp", "heic", "svg"]}
            environmentId={environmentId}
            onFileUpload={(files: string[] | undefined, _fileType: "image" | "video") => {
              if (files?.[0]) {
                setLogoUrl(files[0]);
                setIsEditing(true);
              }
            }}
            disabled={isReadOnly}
            maxSizeInMB={5}
            isStorageConfigured={isStorageConfigured}
          />
        )}

        <Input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg, image/png, image/webp, image/heic, image/svg+xml"
          className="hidden"
          disabled={isReadOnly}
          onChange={handleFileChange}
        />

        {isEditing && logoUrl && (
          <>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!isStorageConfigured) {
                    showStorageNotConfiguredToast();
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                variant="secondary"
                size="sm">
                {t("environments.workspace.look.replace_logo")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmRemoveLogoModalOpen(true)}
                disabled={!isEditing}>
                {t("environments.workspace.look.remove_logo")}
              </Button>
            </div>

            {/* Alinhamento */}
            <div className="space-y-2">
              <Label>Alinhamento</Label>
              <div className="flex gap-1">
                {LOGO_ALIGNMENTS.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLogoAlignment(value)}
                    className={`rounded-md border p-2 transition-colors ${
                      logoAlignment === value
                        ? "border-brand bg-brand-light text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}>
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Tamanho predefinido */}
            <div className="space-y-2">
              <Label>Tamanho</Label>
              <div className="flex gap-1">
                {LOGO_SIZES.map(({ value, label, px }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setLogoSize(value);
                      setLogoHeight(value === "small" ? 40 : value === "medium" ? 64 : 96);
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      logoSize === value
                        ? "border-brand bg-brand-light text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}>
                    {label} ({px})
                  </button>
                ))}
              </div>
            </div>

            {/* Altura customizada */}
            <div className="space-y-2">
              <Label>Altura (px): {logoHeight}px</Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">20</span>
                <input
                  type="range"
                  min={20}
                  max={200}
                  value={logoHeight}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setLogoHeight(h);
                    // Update size preset to match
                    if (h <= 50) setLogoSize("small");
                    else if (h <= 80) setLogoSize("medium");
                    else setLogoSize("large");
                  }}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-800"
                />
                <span className="text-xs text-slate-500">200</span>
              </div>
            </div>

            <AdvancedOptionToggle
              isChecked={isBgColorEnabled}
              onToggle={toggleBackgroundColor}
              htmlId="addBackgroundColor"
              title={t("environments.workspace.look.add_background_color")}
              description={t("environments.workspace.look.add_background_color_description")}
              childBorder
              customContainerClass="p-0"
              childrenContainerClass="overflow-visible"
              disabled={!isEditing}>
              {isBgColorEnabled && (
                <div className="px-2">
                  <ColorPicker
                    color={logoBgColor || "#f8f8f8"}
                    onChange={setLogoBgColor}
                    disabled={!isEditing}
                  />
                </div>
              )}
            </AdvancedOptionToggle>
          </>
        )}
        {logoUrl && (
          <Button onClick={saveChanges} disabled={isLoading || isReadOnly} size="sm">
            {isEditing ? t("common.save") : t("common.edit")}
          </Button>
        )}
        <DeleteDialog
          open={confirmRemoveLogoModalOpen}
          setOpen={setConfirmRemoveLogoModalOpen}
          deleteWhat={t("common.logo")}
          text={t("environments.workspace.look.remove_logo_confirmation")}
          onDelete={removeLogo}
        />
      </div>
      {isReadOnly && (
        <Alert variant="warning" className="mt-4">
          <AlertDescription>
            {t("common.only_owners_managers_and_manage_access_members_can_perform_this_action")}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
