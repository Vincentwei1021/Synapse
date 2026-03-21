#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { SynapseStack } from '../lib/synapse-stack';

const app = new cdk.App();

const stackName = app.node.tryGetContext('stackName') || 'Synapse';
const acmCertificateArn = app.node.tryGetContext('acmCertificateArn') || '';
const customDomain = app.node.tryGetContext('customDomain') || '';
const superAdminEmail = app.node.tryGetContext('superAdminEmail') || '';
const superAdminPassword = app.node.tryGetContext('superAdminPassword') || '';
const nextAuthSecret =
  app.node.tryGetContext('nextAuthSecret') ||
  crypto.randomBytes(32).toString('hex');

// Validate required parameters
if (!acmCertificateArn) {
  throw new Error(
    'acmCertificateArn is required. Pass it via -c acmCertificateArn=arn:aws:acm:...',
  );
}
if (!superAdminEmail) {
  throw new Error(
    'superAdminEmail is required. Pass it via -c superAdminEmail=admin@example.com',
  );
}
if (!superAdminPassword) {
  throw new Error(
    'superAdminPassword is required. Pass it via -c superAdminPassword=yourpassword',
  );
}

// Hash password at synth time
const superAdminPasswordHash = bcrypt.hashSync(superAdminPassword, 10);

new SynapseStack(app, stackName, {
  acmCertificateArn,
  customDomain,
  superAdminEmail,
  superAdminPasswordHash,
  nextAuthSecret,
});
