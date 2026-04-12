// src/app/onboarding/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import { OnboardingStep1 } from "./step1-agent";
import { OnboardingStep2 } from "./step2-connect";
import { OnboardingStep3 } from "./step3-compute";

interface OnboardingStatus {
  hasAgent: boolean;
  hasAgentConnected: boolean;
  hasComputePool: boolean;
  hasComputeNode: boolean;
  hasProject: boolean;
}

interface WizardState {
  agentUuid: string | null;
  agentName: string | null;
  agentType: string | null;
  apiKey: string | null;
  poolUuid: string | null;
  agentConnected: boolean;
  nodeAdded: boolean;
}

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState(1);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [wizardState, setWizardState] = useState<WizardState>({
    agentUuid: null,
    agentName: null,
    agentType: null,
    apiKey: null,
    poolUuid: null,
    agentConnected: false,
    nodeAdded: false,
  });

  // Fetch onboarding status to determine initial step
  useEffect(() => {
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const s: OnboardingStatus = json.data;
          setStatus(s);
          // Auto-advance to first incomplete step
          if (s.hasAgent && s.hasAgentConnected && s.hasComputeNode) {
            router.replace("/research-projects");
          } else if (s.hasAgent && s.hasAgentConnected) {
            setCurrentStep(3);
          } else if (s.hasAgent) {
            setCurrentStep(2);
          }
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSkipAll = () => {
    router.push("/research-projects");
  };

  const handleStep1Complete = (agentUuid: string, agentName: string, agentType: string) => {
    setWizardState((prev) => ({ ...prev, agentUuid, agentName, agentType }));
    setCurrentStep(2);
  };

  const handleStep2Complete = () => {
    setWizardState((prev) => ({ ...prev, agentConnected: true }));
    setCurrentStep(3);
  };

  const handleStep3Complete = useCallback((poolUuid: string) => {
    setWizardState((prev) => ({ ...prev, poolUuid, nodeAdded: true }));
    setTimeout(() => {
      router.push("/research-projects");
    }, 3000);
  }, [router]);

  const handleSkipStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push("/research-projects");
    }
  };

  if (!status) {
    return null;
  }

  const stepDone = (step: number) => {
    if (step === 1) return status.hasAgent || !!wizardState.agentUuid;
    if (step === 2) return status.hasAgentConnected || wizardState.agentConnected;
    if (step === 3) return status.hasComputeNode || wizardState.nodeAdded;
    return false;
  };

  const isComplete = wizardState.nodeAdded;

  return (
    <div className="w-full max-w-[600px]">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/synapse-icon.png" alt="Synapse" width={28} height={28} />
          <span className="text-base font-semibold text-foreground">Synapse</span>
        </div>
        {!isComplete && (
          <Button variant="ghost" size="sm" onClick={handleSkipAll} className="text-muted-foreground">
            {t("skipSetup")}
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                stepDone(step)
                  ? "bg-green-600 text-white"
                  : step === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {stepDone(step) ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < TOTAL_STEPS && (
              <div className={`h-px w-12 ${stepDone(step) ? "bg-green-600" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {isComplete ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t("complete.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("complete.summary", { agentCount: 1, poolCount: 1, nodeCount: 1 })}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{t("complete.redirecting")}</p>
        </div>
      ) : (
        <>
          {currentStep === 1 && (
            <OnboardingStep1
              onComplete={handleStep1Complete}
              onSkip={handleSkipStep}
            />
          )}
          {currentStep === 2 && (
            <OnboardingStep2
              agentUuid={wizardState.agentUuid}
              agentName={wizardState.agentName}
              agentType={wizardState.agentType}
              onComplete={handleStep2Complete}
              onSkip={handleSkipStep}
            />
          )}
          {currentStep === 3 && (
            <OnboardingStep3
              onComplete={handleStep3Complete}
              onSkip={handleSkipStep}
            />
          )}
        </>
      )}
    </div>
  );
}
