import type { ErdEndpointCardinality } from "./erd";

export interface ErdDesignerSettings {
  autoSave: boolean;
  autoLayout: boolean;
  defaultFromCardinality: ErdEndpointCardinality;
  defaultToCardinality: ErdEndpointCardinality;
  newTableColumns: number;
}

export const DEFAULT_SETTINGS: ErdDesignerSettings = {
  autoSave: true,
  autoLayout: true,
  defaultFromCardinality: "one",
  defaultToCardinality: "zero-or-many",
  newTableColumns: 1
};
