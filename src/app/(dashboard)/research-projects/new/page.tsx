"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Lightbulb,
  FolderOpen,
  X,
  Plus,
  Upload,
  Rocket,
  Bell,
} from "lucide-react";
import { createProjectAction } from "./actions";

interface UploadedFile {
  name: string;
  size: number;
  file: File;
}

export default function NewProjectPage() {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [ideas, setIdeas] = useState<string[]>([""]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleAddIdea = () => {
    setIdeas([...ideas, ""]);
  };

  const handleIdeaChange = (index: number, value: string) => {
    const newIdeas = [...ideas];
    newIdeas[index] = value;
    setIdeas(newIdeas);
  };

  const handleRemoveIdea = (index: number) => {
    if (ideas.length > 1) {
      const newIdeas = ideas.filter((_, i) => i !== index);
      setIdeas(newIdeas);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size <= 10 * 1024 * 1024) {
        newFiles.push({
          name: file.name,
          size: file.size,
          file: file,
        });
      }
    }
    setUploadedFiles([...uploadedFiles, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const documents: { name: string; content: string; type: "prd" | "tech_design" | "adr" | "spec" | "guide" }[] = [];

      for (const uploadedFile of uploadedFiles) {
        if (uploadedFile.name.toLowerCase().endsWith(".md")) {
          const content = await uploadedFile.file.text();
          let type: "prd" | "tech_design" | "adr" | "spec" | "guide" = "spec";
          const lowerName = uploadedFile.name.toLowerCase();
          if (lowerName.includes("prd")) type = "prd";
          else if (lowerName.includes("tech") || lowerName.includes("architecture")) type = "tech_design";
          else if (lowerName.includes("adr")) type = "adr";
          else if (lowerName.includes("guide")) type = "guide";

          documents.push({
            name: uploadedFile.name,
            content,
            type,
          });
        }
      }

      const result = await createProjectAction({
        name: formData.name,
        description: formData.description,
        ideas: ideas,
        documents,
      });

      if (result.success && result.projectUuid) {
        localStorage.setItem("currentProjectUuid", result.projectUuid);
        router.push(`/projects/${result.projectUuid}/dashboard`);
      } else {
        setError(result.error || t("projects.createFailed"));
      }
    } catch {
      setError(t("common.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-[#FAF8F4]">
      <div className="px-8 py-6">
        {/* Top Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            <Link href="/projects" className="hover:text-foreground">
              {t("nav.projects")}
            </Link>
            <span className="mx-1">/</span>
            <span>{t("projects.newProject")}</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="h-4 w-4" />
            </Button>
            <div className="h-7 w-7 rounded-full bg-secondary" />
          </div>
        </div>

        {/* Title Section */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("projects.createNew.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("projects.createNew.subtitle")}
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Welcome Banner */}
          <div className="flex items-center gap-4 rounded-2xl border border-[#C67A5230] bg-[#C67A5210] px-6 py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C67A5220]">
              <Rocket className="h-[22px] w-[22px] text-[#C67A52]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#C67A52]">
                {t("projects.createNew.gettingStartedTitle")}
              </p>
              <p className="text-xs leading-relaxed text-[#6B6B6B]">
                {t("projects.createNew.gettingStartedDesc")}
              </p>
            </div>
          </div>

          {/* Step 1: Basic Information Card */}
          <Card className="overflow-hidden rounded-2xl border-l-3 border-l-[#C67A52] border-t-0 border-r-0 border-b-0 shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C67A52] text-[11px] font-semibold text-white">
                  1
                </span>
                <FileText className="h-4 w-4 text-[#C67A52]" />
                {t("projects.createNew.basicInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">{t("projects.createNew.projectName")}</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("projects.createNew.projectNamePlaceholder")}
                  required
                />
              </div>

              <div className="pl-12">
                <Separator className="bg-[#E5E2DC]" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("projects.createNew.descriptionLabel")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t("projects.createNew.descriptionPlaceholder")}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Initial Ideas Card */}
          <Card className="overflow-hidden rounded-2xl border-l-3 border-l-[#C67A52] border-t-0 border-r-0 border-b-0 shadow-none">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C67A52] text-[11px] font-semibold text-white">
                    2
                  </span>
                  <Lightbulb className="h-4 w-4 text-[#C67A52]" />
                  {t("projects.createNew.initialIdeas")}
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">{t("common.optional")}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("projects.createNew.initialIdeasDesc")}
              </p>

              <div className="space-y-3">
                {ideas.map((idea, index) => (
                  <div key={index} className="relative">
                    <Textarea
                      value={idea}
                      onChange={(e) => handleIdeaChange(index, e.target.value)}
                      placeholder={t("projects.createNew.ideaPlaceholder")}
                      rows={3}
                      className="pr-10"
                    />
                    {ideas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveIdea(index)}
                        className="absolute right-2 top-2 h-6 w-6"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddIdea}
                className="mt-3"
              >
                <Plus className="mr-1.5 h-3 w-3" />
                {t("projects.createNew.addAnother")}
              </Button>
            </CardContent>
          </Card>

          {/* Step 3: Documents Card */}
          <Card className="overflow-hidden rounded-2xl border-l-3 border-l-[#C67A52] border-t-0 border-r-0 border-b-0 shadow-none">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C67A52] text-[11px] font-semibold text-white">
                    3
                  </span>
                  <FolderOpen className="h-4 w-4 text-[#C67A52]" />
                  {t("projects.createNew.documents")}
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">{t("common.optional")}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("projects.createNew.documentsDesc")}
              </p>

              {/* Upload Area */}
              <div
                className={`flex h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed transition-colors ${
                  dragActive
                    ? "border-[#C67A52] bg-[#C67A5210]"
                    : "border-[#D0CCC4] bg-[#F5F2EC]"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".md"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-xs text-[#6B6B6B]">
                  {t("projects.createNew.dragDrop")}
                </span>
                <span className="text-[11px] text-[#9A9A9A]">
                  {t("projects.createNew.fileTypes")}
                </span>
              </div>

              {/* Uploaded Files */}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl border border-[#E5E2DC] bg-[#F5F2EC] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#C67A52]" />
                        <span className="text-[13px] text-foreground">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFile(index)}
                          className="h-6 w-6"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Bar */}
          <Separator className="bg-[#E5E2DC]" />
          <div className="flex items-center justify-end gap-3 py-2">
            <Link href="/projects">
              <Button type="button" variant="outline" className="rounded-xl px-6 py-2.5">
                {t("common.cancel")}
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="rounded-xl bg-[#C67A52] px-6 py-2.5 hover:bg-[#B56A42]"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              {loading ? t("common.creating") : t("projects.createNew.createProject")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
