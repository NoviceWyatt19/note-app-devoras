import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type { ErdEndpointCardinality } from "./erd";
import type ErdDesignerPlugin from "./main";

export interface ErdDesignerSettings {
  defaultExportFormat: "svg" | "png";
  defaultFromCardinality: ErdEndpointCardinality;
  defaultToCardinality: ErdEndpointCardinality;
  autoLayout: boolean;
  autoSave: boolean;
  defaultErdFolder: string;
  newTableColumns: string;
}

export const DEFAULT_SETTINGS: ErdDesignerSettings = {
  defaultExportFormat: "svg",
  defaultFromCardinality: "zero-or-many",
  defaultToCardinality: "one",
  autoLayout: false,
  autoSave: false,
  defaultErdFolder: "ERD",
  newTableColumns: "id:uuid:pk:not-null"
};

export class ErdDesignerSettingTab extends PluginSettingTab {
  plugin: ErdDesignerPlugin;

  constructor(app: App, plugin: ErdDesignerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ERD Designer" });

    new Setting(containerEl)
      .setName("Default export format")
      .setDesc("Used by the ribbon export flow and as the initial export preference.")
      .addDropdown((dropdown) => dropdown
        .addOption("svg", "SVG")
        .addOption("png", "PNG")
        .setValue(this.plugin.settings.defaultExportFormat)
        .onChange(async (value) => {
          this.plugin.settings.defaultExportFormat = value as "svg" | "png";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Default source cardinality")
      .setDesc("Used for the source end when creating a new relation.")
      .addDropdown((dropdown) => dropdown
        .addOption("one", "one")
        .addOption("zero-or-one", "zero-or-one")
        .addOption("many", "many")
        .addOption("zero-or-many", "zero-or-many")
        .setValue(this.plugin.settings.defaultFromCardinality)
        .onChange(async (value) => {
          this.plugin.settings.defaultFromCardinality = value as ErdEndpointCardinality;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Default target cardinality")
      .setDesc("Used for the target end when creating a new relation.")
      .addDropdown((dropdown) => dropdown
        .addOption("one", "one")
        .addOption("zero-or-one", "zero-or-one")
        .addOption("many", "many")
        .addOption("zero-or-many", "zero-or-many")
        .setValue(this.plugin.settings.defaultToCardinality)
        .onChange(async (value) => {
          this.plugin.settings.defaultToCardinality = value as ErdEndpointCardinality;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Auto layout")
      .setDesc("Adds a layout command in the designer. Manual positions are still saved.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoLayout)
        .onChange(async (value) => {
          this.plugin.settings.autoLayout = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Auto save")
      .setDesc("Automatically writes valid GUI changes back to the source note after a short delay.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoSave)
        .onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Default ERD folder")
      .setDesc("New standalone ERD files are created in this vault-root folder.")
      .addText((text) => text
        .setPlaceholder("ERD")
        .setValue(this.plugin.settings.defaultErdFolder)
        .onChange(async (value) => {
          this.plugin.settings.defaultErdFolder = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("New table column template")
      .setDesc("Format: name:type[:pk][:fk][:unique][:not-null]. Separate columns with commas.")
      .addText((text) => text
        .setPlaceholder("id:uuid:pk:not-null")
        .setValue(this.plugin.settings.newTableColumns)
        .onChange(async (value) => {
          this.plugin.settings.newTableColumns = value;
          await this.plugin.saveSettings();
        }));
  }
}
