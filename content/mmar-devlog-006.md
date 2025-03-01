Title: mmar - Devlog 6
Description: Deployment, final touches & preparing to launch.
Date: 2025-02-24 12:00
Tags: mmar, golang, devlog, http, tunnel

*This post is part of a devlog series documenting my progress building `mmar`, a cross-platform tunnel that exposes your localhost to the world. If you'd like to follow along from the beginning, you can find all the devlogs [here](/tags/mmar.html).*

## Progress Update

I made it to the most exciting part of any project, seeing it come to life and all the pieces falling into place. Setting up the CI, the build and release process, deploying it in the wild and finally having a few beta testers play around with it and report issues they find. I’ll briefly go over these various steps and my preparations to launch.

## CI and Releasing

In the previous [devlog](/mmar-devlog-005.html), I talked about building out simulation tests for mmar. Since then I’ve added quite a bit of test cases which proved to be super useful, as I found a few issues and fixed them.

Once the tests were running successfully, the next step was to include them as part of continuous integration (CI). Whenever I create a new PR, the simulation tests would run in a Github Action, once they pass, I can safely merge the PR. Otherwise I know something broke. Adding that was quite straightforward, especially since there are no dependancies and I used the built-in testing tool from go: `go test`.

Now that I had the tests setup as part of my CI, next, I wanted to automate the release process. Since mmar is cross platform, I definitely did not want to manually build executables for each OS/architecture. This is where [GoReleaser](https://goreleaser.com/) comes in. It makes building and releasing cross-platform software a breeze. It allowed me to build mmar for Windows, Mac and Linux, in addition to building and pushing a Docker image and a Homebrew formula to their respective repositories. It uploads all the release artifacts (binaries) to the corresponding Github Release page. All of this is defined in [.goreleaser.yaml](https://github.com/yusuf-musleh/mmar/blob/master/.goreleaser.yaml), the best part is, all of this is free and [open source](https://github.com/goreleaser/goreleaser)!

Similar to tests, I've created a Github Action that runs the [GoReleaser Github Action](https://github.com/goreleaser/goreleaser-action) when a new tag is created and pushed to the mmar repo. Once setup, I all have to do is create a new git tag, example: `v0.2.3`, and push it to GitHub, and the new release action is triggered, a few seconds later the latest version of mmar is built and available across all the platforms.

## Deployment

Now that I have a docker image built, I can begin deploying mmar on a VPS. If you remember from previous devlogs, when you run the mmar server, it starts both a HTTP server and a TCP server. The HTTP server handles HTTP requests coming into the tunnel, and the TCP server handles communication between the mmar server and mmar client. Since each of these run on a different port, we need to route the requests coming in to the correct server. Not only that, since mmar generates random subdomains for each tunnel created, we need to handle TLS certificates for wildcard subdomains on the `mmar.dev` domain.

Given these 2 requirements, [Caddy](https://caddyserver.com/) can handle them both for us. It’s a reverse proxy and gives you TLS certificates by default, so we just need to configure Caddy and run it to route the requests to the appropriate servers/ports. So I simply defined a Docker compose file, included the mmar server and the configured Caddy server as services, started the containers, and I was able to create a mmar tunnel!

If you’re interested in instruction on how to self-host your own mmar server and the configurations I used in more detail, I’ve included the steps to self-host in the [README](https://github.com/yusuf-musleh/mmar?tab=readme-ov-file#self-host).

## Beta Users + Fixing issues

Now that mmar was actually live and usable, the next natural step was to get some folks to use it and get their feedback. I got a few of my developer friends to try it out, thankfully they found a few issues and let me know about them. We did the feedback loop a few times, ironing out any issues or problems they faced. 

Here’s an example of something they found issue with. Every time your computer disconnects or loses internet access, the tunnel disconnects and you needed to manually re-run the client and mmar will give you a different subdomain. So you can imagine how annoying it gets if you have this URL defined somewhere in some other code base that you are using to test, and it keeps changing. So I went ahead and implemented reconnecting mmar clients that maintain the same subdomain as long as you do not shutdown the client yourself. That was a pretty valuable insight I got from having people try it out. 

## Final Preparations

Wrapping up this devlop, which will likely be the last one, as the next post will be the launch announcement! All that’s left before then is creating a logo/artwork for the repo, adding a demo gif and ironing out the README. Thanks for reading, and see you in the next one!
