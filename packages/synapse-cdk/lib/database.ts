import { Construct } from 'constructs';
import {
  Duration,
  RemovalPolicy,
  SecretValue,
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Network } from './network';

export const DB_NAME = 'synapse';

interface DatabaseProps {
  readonly networkStack: Network;
  readonly superAdminEmail: string;
  readonly superAdminPasswordHash: string;
  readonly nextAuthSecret: string;
}

export class Database extends Construct {
  readonly dbCredentialSecret: secretsmanager.Secret;
  readonly appConfigSecret: secretsmanager.Secret;
  readonly dbEndpointAddress: string;
  readonly dbEndpointPort: string;

  private readonly _dbCluster: rds.DatabaseCluster;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // DB credential secret (auto-generated username + password)
    this.dbCredentialSecret = new secretsmanager.Secret(
      this,
      'DBCredential',
      {
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: 'synapseUser' }),
          generateStringKey: 'password',
          excludeCharacters: '!@#$%^&*()-_=+[]{}|;:,.<>?/`~\\\'"',
          includeSpace: false,
          excludePunctuation: true,
        },
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );

    // App config secret (super admin + nextauth)
    this.appConfigSecret = new secretsmanager.Secret(this, 'AppConfig', {
      secretStringValue: SecretValue.unsafePlainText(
        JSON.stringify({
          SUPER_ADMIN_EMAIL: props.superAdminEmail,
          SUPER_ADMIN_PASSWORD_HASH: props.superAdminPasswordHash,
          NEXTAUTH_SECRET: props.nextAuthSecret,
        }),
      ),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Aurora Serverless v2 PostgreSQL 17.6
    this._dbCluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_6,
      }),
      vpc: props.networkStack.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      credentials: rds.Credentials.fromSecret(this.dbCredentialSecret),
      defaultDatabaseName: DB_NAME,
      securityGroups: [props.networkStack.dbSecurityGroup],
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      backup: {
        retention: Duration.days(1),
        preferredWindow: '19:00-20:00',
      },
    });

    this.dbEndpointAddress = this._dbCluster.clusterEndpoint.hostname;
    this.dbEndpointPort = this._dbCluster.clusterEndpoint.port.toString();
  }

  get connections(): ec2.Connections {
    return this._dbCluster.connections;
  }

  get dbResource(): Construct {
    return this._dbCluster as unknown as Construct;
  }
}
