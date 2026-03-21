import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_elasticache as elasticache,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Network } from './network';

export class Cache extends Construct {
  readonly redisEndpoint: string;
  readonly redisPort: string;
  /** Secrets Manager secret containing the Redis password (key: "password") */
  readonly redisSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: { networkStack: Network }) {
    super(scope, id);

    const redisSG = new ec2.SecurityGroup(this, 'RedisSG', {
      vpc: props.networkStack.vpc,
      description: 'Security group for ElastiCache Redis',
    });

    redisSG.addIngressRule(
      props.networkStack.serviceSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS service'
    );

    // Generate a random password and store in Secrets Manager
    const redisSecret = new secretsmanager.Secret(this, 'RedisSecret', {
      description: 'ElastiCache Redis password for Synapse',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'synapse' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });
    this.redisSecret = redisSecret;

    // RBAC user with password authentication (PascalCase for CloudFormation L1)
    const redisUser = new elasticache.CfnUser(this, 'RedisUser', {
      engine: 'redis',
      userId: 'synapse',
      userName: 'synapse',
      accessString: 'on ~* +@all',
      authenticationMode: {
        Type: 'password',
        Passwords: [
          redisSecret.secretValueFromJson('password').unsafeUnwrap(),
        ],
      } as unknown as elasticache.CfnUser.AuthenticationModeProperty,
    });

    // User group must include the built-in 'default' user (already exists in AWS).
    // We reference it by ID — do NOT create a new CfnUser with userId 'default'.
    const userGroup = new elasticache.CfnUserGroup(this, 'RedisUserGroup', {
      engine: 'redis',
      userGroupId: 'synapse-users',
      userIds: ['default', redisUser.ref],
    });

    const redis = new elasticache.CfnServerlessCache(this, 'Redis', {
      engine: 'redis',
      serverlessCacheName: 'synapse-events',
      securityGroupIds: [redisSG.securityGroupId],
      subnetIds: props.networkStack.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds,
      majorEngineVersion: '7',
      userGroupId: userGroup.ref,
      cacheUsageLimits: {
        dataStorage: { maximum: 1, unit: 'GB' },
        ecpuPerSecond: { maximum: 1000 },
      },
    });

    redis.addDependency(userGroup);

    this.redisEndpoint = redis.attrEndpointAddress;
    this.redisPort = redis.attrEndpointPort;
  }
}
