"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observedFields = observedFields;
const node_util_1 = require("node:util");
function observedFields(input, keys) {
    const result = Object.create(null);
    if (!input || typeof input !== 'object' || node_util_1.types.isProxy(input))
        return result;
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor && 'value' in descriptor)
            result[key] = descriptor.value;
    }
    return result;
}
//# sourceMappingURL=ObservedFields.js.map