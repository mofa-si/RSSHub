import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import * as cheerio from 'cheerio';
import utils from './utils';
import { config } from '@/config';
import { parseDate } from '@/utils/parse-date';
import ConfigNotFoundError from '@/errors/types/config-not-found';
import InvalidParameterError from '@/errors/types/invalid-parameter';

export const route: Route = {
    path: '/channel/:id/:embed?',
    categories: ['social-media'],
    example: '/youtube/channel/UCDwDMPOZfxVV0x_dz0eQ8KQ',
    parameters: { id: 'YouTube channel id', embed: 'Default to embed the video, set to any value to disable embedding' },
    features: {
        requireConfig: [
            {
                name: 'YOUTUBE_KEY',
                description: ' YouTube API Key, support multiple keys, split them with `,`, [API Key application](https://console.developers.google.com/)',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.youtube.com/channel/:id'],
            target: '/channel/:id',
        },
    ],
    name: 'Channel with id',
    maintainers: ['DIYgod'],
    handler,
    description: `:::tip
YouTube provides official RSS feeds for channels, for instance [https://www.youtube.com/feeds/videos.xml?channel\_id=UCDwDMPOZfxVV0x\_dz0eQ8KQ](https://www.youtube.com/feeds/videos.xml?channel_id=UCDwDMPOZfxVV0x_dz0eQ8KQ).
:::`,
};

async function handler(ctx) {
    if (!config.youtube || !config.youtube.key) {
        throw new ConfigNotFoundError('YouTube RSS is disabled due to the lack of <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config</a>');
    }
    const id = ctx.req.param('id');
    const embed = !ctx.req.param('embed');

    if (!utils.isYouTubeChannelId(id)) {
        throw new InvalidParameterError(`Invalid YouTube channel ID. \nYou may want to use <code>/youtube/user/:id</code> instead.`);
    }

    const channelLink = `https://www.youtube.com/channel/${id}`;
    const response = await got(channelLink);
    const $ = cheerio.load(response.data);
    const channelLogo = $('meta[property="og:image"]').attr('content');
    const channelDescription = $('meta[property="og:description"]').attr('content');

    const playlistId = (await utils.getChannelWithId(id, 'contentDetails', cache)).data.items[0].contentDetails.relatedPlaylists.uploads;

    const data = (await utils.getPlaylistItems(playlistId, 'snippet', cache)).data.items;

    return {
        title: `${data[0].snippet.channelTitle} - YouTube`,
        link: channelLink,
        logo: channelLogo,
        description: channelDescription,
        item: data
            .filter((d) => d.snippet.title !== 'Private video' && d.snippet.title !== 'Deleted video')
            .map((item) => {
                const snippet = item.snippet;
                const videoId = snippet.resourceId.videoId;
                const img = utils.getThumbnail(snippet.thumbnails);
                const description = utils.formatDescription(snippet.description);
                return {
                    title: snippet.title,
                    cover: img.url,
                    description: utils.renderDescription(embed, videoId, img, description),
                    pubDate: parseDate(snippet.publishedAt),
                    link: `https://www.youtube.com/watch?v=${videoId}`,
                    author: snippet.videoOwnerChannelTitle,
                    _extra: {
                        intro: description,
                        duration: snippet.duration,
                        iframeUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
                    },
                };
            }),
    };
}
