My personal website/blog. Built with [blag](https://github.com/venthur/blag).

## Running locally

```sh
docker build -t personal-website .
docker run --rm -it -v .:/app/ personal-website
```

## Updating content

1. Edit the contents of files in `/content`
1. To add a new page, create a `.md` file without defining the `Date` field
1. To add a new writing, create an .md file with the `Data` field
1. Once you are happy with the new content, generate the static files

	```sh
	blab -v build -o docs
	```

	That should generate the new static files in the `/docs` directory
1. Since I don't want the writings on the index page, replace the contents of `docs/writings.html` with contents of `docs/index.html`, and replace the contents of `docs/index.html` with the contents of `docs/about.html`.
1. Fix the `<title>` tags of both files
