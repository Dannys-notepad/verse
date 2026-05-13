import axios from 'axios';

const instance = axios.create({
    timeout: Number(process.env.AXIOS_TIMEOUT ?? 30000),
    headers: {
        'User-Agent': process.env.AXIOS_USER_AGENT ?? 'Verse/1.0.0',
        'Content-Type': 'application/json',
    },
});

instance.interceptors.response.use(
    res => res,
    async error => {
        const config = error.config;
        const status = error.response?.status;

        const shouldRetry =
            !error.response || status >= 500 || status === 429;

        if (!config || !shouldRetry) {
            return Promise.reject(error);
        }

        config.__retryCount = (config.__retryCount ?? 0) + 1;

        if (config.__retryCount > (process.env.AXIOS_MAX_RETRY ?? 3)) {
            return Promise.reject(error);
        }

        await new Promise(r => setTimeout(r, config.__retryCount * 1000));
        return instance(config);
    }
);

export default instance;