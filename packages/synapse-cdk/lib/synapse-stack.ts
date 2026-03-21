import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Network } from './network';
import { Database } from './database';
import { Cache } from './cache';
import { Service } from './service';

export interface SynapseStackProps extends StackProps {
  readonly acmCertificateArn: string;
  readonly customDomain: string;
  readonly superAdminEmail: string;
  readonly superAdminPasswordHash: string;
  readonly nextAuthSecret: string;
}

export class SynapseStack extends Stack {
  constructor(scope: Construct, id: string, props: SynapseStackProps) {
    super(scope, id, props);
    this.templateOptions.description =
      'Synapse - ECS/ALB/Aurora Serverless v2 stack';

    const network = new Network(this, 'Network', {});

    const database = new Database(this, 'Database', {
      networkStack: network,
      superAdminEmail: props.superAdminEmail,
      superAdminPasswordHash: props.superAdminPasswordHash,
      nextAuthSecret: props.nextAuthSecret,
    });

    const cache = new Cache(this, 'Cache', { networkStack: network });

    new Service(this, 'Service', {
      vpc: network.vpc,
      networkStack: network,
      database,
      cache,
      acmCertificateArn: props.acmCertificateArn,
      customDomain: props.customDomain,
    });
  }
}
