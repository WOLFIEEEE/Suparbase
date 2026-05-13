import type { Column } from "@/lib/types/schema";
import { FieldText } from "./FieldText";
import { FieldTextarea } from "./FieldTextarea";
import { FieldNumber } from "./FieldNumber";
import { FieldBool } from "./FieldBool";
import { FieldDateTime } from "./FieldDateTime";
import { FieldUuid } from "./FieldUuid";
import { FieldJson } from "./FieldJson";
import { FieldEnum } from "./FieldEnum";
import { FieldFk } from "./FieldFk";
import type { FieldProps } from "./types";

export type FieldComponent = (props: FieldProps) => React.JSX.Element;

const LONG_TEXT_THRESHOLD = 255;

export function pickField(column: Column): FieldComponent {
  if (column.fk) return FieldFk;
  if (column.category === "enum") return FieldEnum;
  switch (column.category) {
    case "boolean":
      return FieldBool;
    case "integer":
    case "float":
      return FieldNumber;
    case "date":
    case "datetime":
      return FieldDateTime;
    case "uuid":
      return FieldUuid;
    case "json":
      return FieldJson;
    case "text":
      return FieldTextarea;
    case "string": {
      const isLong =
        (column.maxLength ?? 0) > LONG_TEXT_THRESHOLD ||
        column.pgType.toLowerCase() === "text";
      return isLong ? FieldTextarea : FieldText;
    }
    default:
      return FieldText;
  }
}
