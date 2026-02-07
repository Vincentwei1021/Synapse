#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const crypto = __importStar(require("crypto"));
const bcrypt = __importStar(require("bcryptjs"));
const chorus_stack_1 = require("../lib/chorus-stack");
const app = new cdk.App();
const stackName = app.node.tryGetContext('stackName') || 'Chorus';
const acmCertificateArn = app.node.tryGetContext('acmCertificateArn') || '';
const customDomain = app.node.tryGetContext('customDomain') || '';
const superAdminEmail = app.node.tryGetContext('superAdminEmail') || '';
const superAdminPassword = app.node.tryGetContext('superAdminPassword') || '';
const nextAuthSecret = app.node.tryGetContext('nextAuthSecret') ||
    crypto.randomBytes(32).toString('hex');
// Validate required parameters
if (!acmCertificateArn) {
    throw new Error('acmCertificateArn is required. Pass it via -c acmCertificateArn=arn:aws:acm:...');
}
if (!superAdminEmail) {
    throw new Error('superAdminEmail is required. Pass it via -c superAdminEmail=admin@example.com');
}
if (!superAdminPassword) {
    throw new Error('superAdminPassword is required. Pass it via -c superAdminPassword=yourpassword');
}
// Hash password at synth time
const superAdminPasswordHash = bcrypt.hashSync(superAdminPassword, 10);
new chorus_stack_1.ChorusStack(app, stackName, {
    acmCertificateArn,
    customDomain,
    superAdminEmail,
    superAdminPasswordHash,
    nextAuthSecret,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hvcnVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hvcnVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsK0NBQWlDO0FBQ2pDLGlEQUFtQztBQUNuQyxzREFBa0Q7QUFFbEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksUUFBUSxDQUFDO0FBQ2xFLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDNUUsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2xFLE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3hFLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDOUUsTUFBTSxjQUFjLEdBQ2xCLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDO0lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRXpDLCtCQUErQjtBQUMvQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUN2QixNQUFNLElBQUksS0FBSyxDQUNiLGlGQUFpRixDQUNsRixDQUFDO0FBQ0osQ0FBQztBQUNELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUNyQixNQUFNLElBQUksS0FBSyxDQUNiLCtFQUErRSxDQUNoRixDQUFDO0FBQ0osQ0FBQztBQUNELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQ3hCLE1BQU0sSUFBSSxLQUFLLENBQ2IsZ0ZBQWdGLENBQ2pGLENBQUM7QUFDSixDQUFDO0FBRUQsOEJBQThCO0FBQzlCLE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUV2RSxJQUFJLDBCQUFXLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRTtJQUM5QixpQkFBaUI7SUFDakIsWUFBWTtJQUNaLGVBQWU7SUFDZixzQkFBc0I7SUFDdEIsY0FBYztDQUNmLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCAqIGFzIGJjcnlwdCBmcm9tICdiY3J5cHRqcyc7XG5pbXBvcnQgeyBDaG9ydXNTdGFjayB9IGZyb20gJy4uL2xpYi9jaG9ydXMtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5jb25zdCBzdGFja05hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdzdGFja05hbWUnKSB8fCAnQ2hvcnVzJztcbmNvbnN0IGFjbUNlcnRpZmljYXRlQXJuID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYWNtQ2VydGlmaWNhdGVBcm4nKSB8fCAnJztcbmNvbnN0IGN1c3RvbURvbWFpbiA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2N1c3RvbURvbWFpbicpIHx8ICcnO1xuY29uc3Qgc3VwZXJBZG1pbkVtYWlsID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnc3VwZXJBZG1pbkVtYWlsJykgfHwgJyc7XG5jb25zdCBzdXBlckFkbWluUGFzc3dvcmQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdzdXBlckFkbWluUGFzc3dvcmQnKSB8fCAnJztcbmNvbnN0IG5leHRBdXRoU2VjcmV0ID1cbiAgYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnbmV4dEF1dGhTZWNyZXQnKSB8fFxuICBjcnlwdG8ucmFuZG9tQnl0ZXMoMzIpLnRvU3RyaW5nKCdoZXgnKTtcblxuLy8gVmFsaWRhdGUgcmVxdWlyZWQgcGFyYW1ldGVyc1xuaWYgKCFhY21DZXJ0aWZpY2F0ZUFybikge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ2FjbUNlcnRpZmljYXRlQXJuIGlzIHJlcXVpcmVkLiBQYXNzIGl0IHZpYSAtYyBhY21DZXJ0aWZpY2F0ZUFybj1hcm46YXdzOmFjbTouLi4nLFxuICApO1xufVxuaWYgKCFzdXBlckFkbWluRW1haWwpIHtcbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICdzdXBlckFkbWluRW1haWwgaXMgcmVxdWlyZWQuIFBhc3MgaXQgdmlhIC1jIHN1cGVyQWRtaW5FbWFpbD1hZG1pbkBleGFtcGxlLmNvbScsXG4gICk7XG59XG5pZiAoIXN1cGVyQWRtaW5QYXNzd29yZCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3N1cGVyQWRtaW5QYXNzd29yZCBpcyByZXF1aXJlZC4gUGFzcyBpdCB2aWEgLWMgc3VwZXJBZG1pblBhc3N3b3JkPXlvdXJwYXNzd29yZCcsXG4gICk7XG59XG5cbi8vIEhhc2ggcGFzc3dvcmQgYXQgc3ludGggdGltZVxuY29uc3Qgc3VwZXJBZG1pblBhc3N3b3JkSGFzaCA9IGJjcnlwdC5oYXNoU3luYyhzdXBlckFkbWluUGFzc3dvcmQsIDEwKTtcblxubmV3IENob3J1c1N0YWNrKGFwcCwgc3RhY2tOYW1lLCB7XG4gIGFjbUNlcnRpZmljYXRlQXJuLFxuICBjdXN0b21Eb21haW4sXG4gIHN1cGVyQWRtaW5FbWFpbCxcbiAgc3VwZXJBZG1pblBhc3N3b3JkSGFzaCxcbiAgbmV4dEF1dGhTZWNyZXQsXG59KTtcbiJdfQ==