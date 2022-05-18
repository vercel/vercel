declare const TLSProfiles: {
    /**
     * TLS settings for Redis.com Cloud Fixed plan. Updated on 2021-10-06.
     */
    readonly RedisCloudFixed: {
        readonly ca: string;
    };
    /**
     * TLS settings for Redis.com Cloud Flexible plan. Updated on 2021-10-06.
     */
    readonly RedisCloudFlexible: {
        readonly ca: string;
    };
};
export default TLSProfiles;
