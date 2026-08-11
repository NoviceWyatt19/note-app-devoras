import re

with open('project/src/widgets/ErdDesigner/ui/ErdDesigner.tsx', 'r') as f:
    content = f.read()

# Remove obsidian imports
content = re.sub(r'import type \{ App, WorkspaceLeaf \} from "obsidian";\n', '', content)
content = re.sub(r'import \{ ItemView, Notice, TFile \} from "obsidian";\n', '', content)
content = re.sub(r'import \{ createRoot, type Root \} from "react-dom/client";\n', '', content)

# Fix internal imports
content = content.replace('from "./blocks"', 'from "../../../entities/erd/lib/blocks"')
content = content.replace('from "./erd"', 'from "../../../entities/erd/model/erd"')
content = content.replace('from "./staticRenderer"', 'from "../../../entities/erd/lib/staticRenderer"')
content = content.replace('from "./relations"', 'from "../../../entities/erd/lib/relations"')
content = content.replace('from "./settings"', 'from "../../../entities/erd/model/settings"')

# Remove ItemView and ErdViewTarget
itemViewRegex = r'export const ERD_VIEW_TYPE = "erd-designer-view";.*?\}\n\nfunction ErdDesigner'
content = re.sub(itemViewRegex, 'export default function ErdDesigner', content, flags=re.DOTALL)

# Fix Props
propsRegex = r'interface ErdDesignerProps \{.*?\}'
newProps = """export interface ErdDesignerProps {
  document: ErdDocumentV1;
  settings: ErdDesignerSettings;
  onChange: (document: ErdDocumentV1) => void;
  onExportSvg: (document: ErdDocumentV1) => void;
  onExportPng: (document: ErdDocumentV1) => Promise<void>;
}"""
content = re.sub(propsRegex, newProps, content, flags=re.DOTALL)

# We need to fix the use of Notice.
content = re.sub(r'new Notice\((.*?)\);', r'console.log(\1);', content)

# Fix target usage
content = content.replace('props.target?.document ?? null', 'props.document')
content = content.replace('const [target, setTarget] = useState<ErdViewTarget | null>(props.target);\n', '')
content = content.replace('setTarget(props.target);\n', '')
content = content.replace('setTarget(nextTarget);\n', '')
content = content.replace(', target', '')
content = content.replace('|| !target', '')
content = content.replace('!target', 'false')
content = content.replace('target.filePath', '"erd.md"')

# Fix save function
saveRegex = r'const save = useCallback\(async \(silent = false\): Promise<void> => \{.*?  \}, \[[^\]]*\]\);'
newSave = """const save = useCallback((silent = false) => {
    if (!document) return;
    const result = validateErdDocument(document);
    if (!result.valid) {
      alert("Fix ERD validation errors before saving.");
      return;
    }
    props.onChange(document);
    setDirty(false);
  }, [document, props]);"""
content = re.sub(saveRegex, newSave, content, flags=re.DOTALL)

# Fix save effect
saveEffectRegex = r'React\.useEffect\(\(\) => \{\n    if \(!props\.settings\.autoSave.*?\}, \[[^\]]*\]\);'
content = re.sub(saveEffectRegex, '', content, flags=re.DOTALL)

# Update ReactFlow to add onNodeDragStop
content = content.replace('onNodesChange={onNodesChange}', 
'''onNodesChange={onNodesChange}
            onNodeDragStop={() => {
              if (document) {
                props.onChange(document);
                setDirty(false);
              }
            }}''')

# empty state
content = content.replace('if (!document || false) {', 'if (!document) {')

with open('project/src/widgets/ErdDesigner/ui/ErdDesigner.tsx', 'w') as f:
    f.write(content)
