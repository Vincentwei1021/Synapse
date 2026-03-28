// src/services/experiment-run.service.ts
// ExperimentRun service entrypoint. Query, lifecycle, criteria, and dependency
// logic live in focused modules while this file keeps the public surface stable.

import {
  checkAcceptanceCriteriaGate,
  checkDependenciesResolved,
  getAcceptanceStatus,
  getExperimentRun,
  getExperimentRunByUuid,
  getProjectRunDependencies,
  getRunDependencies,
  getUnblockedExperimentRuns,
  listExperimentRuns,
} from "@/services/experiment-run-query.service";
import {
  claimExperimentRun,
  createExperimentRun,
  createExperimentRunsFromDesign,
  deleteExperimentRun,
  releaseExperimentRun,
  submitExperimentRunResults,
  updateExperimentRun,
} from "@/services/experiment-run-lifecycle.service";
import {
  createAcceptanceCriteria,
  markAcceptanceCriteria,
  reportCriteriaSelfCheck,
  resetAcceptanceCriterion,
} from "@/services/experiment-run-criteria.service";
import {
  addRunDependency,
  removeRunDependency,
} from "@/services/experiment-run-dependency.service";
import {
  computeAcceptanceStatus,
  isValidExperimentRunStatusTransition,
  type AcceptanceCriterionResponse,
  type AcceptanceSummary,
  type BlockerInfo,
  type ExperimentRunClaimParams,
  type ExperimentRunCreateParams,
  type ExperimentRunListParams,
  type ExperimentRunResponse,
  type ExperimentRunUpdateParams,
  type RunDependencyInfo,
  EXPERIMENT_RUN_STATUS_TRANSITIONS,
} from "@/services/experiment-run.types";

export {
  checkAcceptanceCriteriaGate,
  checkDependenciesResolved,
  computeAcceptanceStatus,
  getAcceptanceStatus,
  getExperimentRun,
  getExperimentRunByUuid,
  getProjectRunDependencies,
  getRunDependencies,
  getUnblockedExperimentRuns,
  isValidExperimentRunStatusTransition,
  listExperimentRuns,
  addRunDependency,
  claimExperimentRun,
  createAcceptanceCriteria,
  createExperimentRun,
  createExperimentRunsFromDesign,
  deleteExperimentRun,
  EXPERIMENT_RUN_STATUS_TRANSITIONS,
  markAcceptanceCriteria,
  releaseExperimentRun,
  removeRunDependency,
  reportCriteriaSelfCheck,
  resetAcceptanceCriterion,
  submitExperimentRunResults,
  updateExperimentRun,
};

export type {
  AcceptanceCriterionResponse,
  AcceptanceSummary,
  BlockerInfo,
  ExperimentRunClaimParams,
  ExperimentRunCreateParams,
  ExperimentRunListParams,
  ExperimentRunResponse,
  ExperimentRunUpdateParams,
  RunDependencyInfo,
};
