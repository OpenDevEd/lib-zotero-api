#!/usr/bin/env node
//import { stringify } from "@iarna/toml";
//import * as argparse from 'argparse';
require('dotenv').config();
require('docstring');
const os = require('os');
// import { ArgumentParser } from 'argparse'
const { ArgumentParser } = require('argparse');
const toml = require('@iarna/toml');
const fs = require('fs');
const path = require('path');
const request = require('request-promise');
//const { LinkHeader } = require('http-link-header');
const LinkHeader = require('http-link-header');
const Ajv = require('ajv');
const { parse } = require("args-any");
// import { parse as TOML } from '@iarna/toml'
// import fs = require('fs')
// import path = require('path')
// import request = require('request-promise')
// import * as LinkHeader from 'http-link-header'
// TODO: Review issues here https://github.com/edtechhub/zotero-cli/issues and where this relevant, implement below.
// import Ajv = require('ajv')
const ajv = new Ajv();
const md5 = require('md5-file');
function sleep(msecs) {
    return new Promise(resolve => setTimeout(resolve, msecs));
}
const arg = new class {
    integer(v) {
        if (isNaN(parseInt(v)))
            throw new Error(`${JSON.stringify(v)} is not an integer`);
        return parseInt(v);
    }
    file(v) {
        if (!fs.existsSync(v) || !fs.lstatSync(v).isFile())
            throw new Error(`${JSON.stringify(v)} is not a file`);
        return v;
    }
    path(v) {
        if (!fs.existsSync(v))
            throw new Error(`${JSON.stringify(v)} does not exist`);
        return v;
    }
    json(v) {
        return JSON.parse(v);
    }
};
module.exports = class Zotero {
    constructor(args) {
        // The following config keys are expected/allowed, with both "-" and "_". The corresponding variables have _
        this.config_keys = ["user-id", "group-id", "library-type", "api-key", "indent", "verbose", "debug"];
        this.base = "https://api.zotero.org";
        this.output = '';
        this.headers = {
            'User-Agent': 'Zotero-CLI',
            'Zotero-API-Version': '3',
            'Zotero-API-Key': ''
        };
        if (!args) {
            args = {};
        }
        //args = args
        // Read config (which also sets the Zotero-API-Key value in the header)
        // TODO: readConfig may need to perform an async operation...
        const message = this.configure(args, true);
        if (message["status"] == "success") {
        }
    }
    // zotero: any
    async configure(args, readconfigfile = false) {
        // pick up config: The function reads args and populates config
        /*
        Called during initialisation.
    
        INPUT:
    
        args = {
          config: "zotero-lib.toml"
        }
    
        or
    
        args = {
          user-id: "XXX",
          group-id: "123",
          library-type: "group",
          indent = 4,
          api-key: "XXX"
        }
    
        OUTPUT:
    
        this.config = {
          user-id: "XXX",
          group-id: "123",
          library-type: "group",
          indent = 4,
          api-key: "XXX"
        }
        */
        if (readconfigfile || args.config) {
            const config = [args.config, 'zotero-cli.toml', `${os.homedir()}/.config/zotero-cli/zotero-cli.toml`].find(cfg => fs.existsSync(cfg));
            this.config = config ? toml.parse(fs.readFileSync(config, 'utf-8')) : {};
        }
        // Change "-" to "_"
        this.config_keys.forEach(key => {
            const undersc = key.replace("-", "_");
            if (key != undersc) {
                if (this.config[key]) {
                    this.config[undersc] = this.config[key];
                }
                delete this.config[key];
                if (args[key]) {
                    args[undersc] = args[key];
                }
                delete args[key];
            }
            // copy selected values
            if (args[undersc]) {
                this.config[undersc] = args[undersc];
            }
        });
        /*
            // Overwrite config with values from args
            // Dont use all object keys, but just designated keys
            // Object.keys(args).forEach(key => {
            config_keys.forEach(key => {
              if (args[key]) {
                this.config[key] = args[key]
              }
            })
        */
        // Now use the config:
        if (this.config.api_key) {
            this.headers['Zotero-API-Key'] = this.config.api_key;
        }
        else {
            return this.message(1, 'No API key provided in args or config');
        }
        if (args.verbose)
            console.log("config=" + JSON.stringify(this.config, null, 2));
        // Check that one and only one is defined:
        if (this.config.user_id === null && this.config.group_id === null)
            return this.message(0, 'Both user/group are null. You must provide exactly one of --user-id or --group-id');
        // TODO:
        // if (this.config.user_id !== null && this.config.group_id !== null) return this.message(0,'Both user/group are specified. You must provide exactly one of --user-id or --group-id')
        // user_id==0 is generic; retrieve the real user id via the api_key
        if (this.config.user_id === 0)
            this.config.user_id = (await this.get(`/keys/${args.api_key}`, { userOrGroupPrefix: false })).userID;
        // using default=2 above prevents the overrides from being picked up
        if (args.indent === null)
            args.indent = 2;
        if (this.config.indent === null)
            this.config.indent = 2;
        return this.message(0, "success");
    }
    showConfig() {
        console.log("showConfig=" + JSON.stringify(this.config, null, 2));
        return this.config;
    }
    async reconfigure(args) {
        // Changing this to a more limited reconfigure
        // this.configure(args, false)
        // console.log("Reconfigure")
        let newargs;
        this.config_keys.forEach(item => {
            if (args[item])
                newargs[item] = args[item];
        });
        this.configure(args, false);
    }
    message(stat = 0, msg = "None", data = null) {
        return {
            "status": stat,
            "message": msg,
            "data": data
        };
    }
    finalActions(output) {
        //console.log("args="+JSON.stringify(args))
        //TODO: Look at the type of output: if string, then print, if object, then stringify
        if (this.config.out)
            fs.writeFileSync(this.config.out, JSON.stringify(output, null, this.config.indent));
        if (this.config.show || this.config.verbose)
            this.show(output);
    }
    // library starts.
    print(...args) {
        if (!this.config.out) {
            console.log.apply(console, args);
        }
        else {
            this.output += args.map(m => {
                const type = typeof m;
                if (type === 'string' || m instanceof String || type === 'number' || type === 'undefined' || type === 'boolean' || m === null)
                    return m;
                if (m instanceof Error)
                    return `<Error: ${m.message || m.name}${m.stack ? `\n${m.stack}` : ''}>`;
                if (m && type === 'object' && m.message)
                    return `<Error: ${m.message}#\n${m.stack}>`;
                return JSON.stringify(m, null, this.config.indent);
            }).join(' ') + '\n';
        }
    }
    // Function to get more than 100 records, i.e. chunked retrieval.
    async all(uri, params = {}) {
        console.log("all=" + uri);
        let chunk = await this.get(uri, { resolveWithFullResponse: true, params })
            .catch(error => {
            console.log("Error in all: " + error);
        });
        let data = chunk.body;
        //console.log("ALL-TEMPORARY=" + JSON.stringify(data, null, 2))
        //const lh = LinkHeader.parse(chunk.headers.link)
        //console.log("ALL-TEMPORARY=" + JSON.stringify(lh, null, 2))
        let link = chunk.headers.link && LinkHeader.parse(chunk.headers.link).rel('next');
        while (link && link.length && link[0].uri) {
            if (chunk.headers.backoff)
                await sleep(parseInt(chunk.headers.backoff) * 1000);
            chunk = await request({
                uri: link[0].uri,
                headers: this.headers,
                json: true,
                resolveWithFullResponse: true,
            });
            data = data.concat(chunk.body);
            link = chunk.headers.link && LinkHeader.parse(chunk.headers.link).rel('next');
        }
        return data;
    }
    /**
     * get/put-type functions
     */
    // The Zotero API uses several commands: get, post, patch, delete - these are defined below.
    async get(uri, options = {}) {
        if (typeof options.userOrGroupPrefix === 'undefined')
            options.userOrGroupPrefix = true;
        if (typeof options.params === 'undefined')
            options.params = {};
        if (typeof options.json === 'undefined')
            options.json = true;
        let prefix = '';
        if (options.userOrGroupPrefix)
            prefix = this.config.user_id ? `/users/${this.config.user_id}` : `/groups/${this.config.group_id}`;
        const params = Object.keys(options.params).map(param => {
            let values = options.params[param];
            if (!Array.isArray(values))
                values = [values];
            return values.map(v => `${param}=${encodeURI(v)}`).join('&');
        }).join('&');
        uri = `${this.base}${prefix}${uri}${params ? '?' + params : ''}`;
        if (this.config.verbose)
            console.error('GET', uri);
        const res = await request({
            uri,
            headers: this.headers,
            encoding: null,
            json: options.json,
            resolveWithFullResponse: options.resolveWithFullResponse,
        }).then().catch(error => {
            console.log(`Error in zotero.get = ${JSON.stringify(error, null, 2)}`);
            return error;
        });
        console.log("all=" + JSON.stringify(res, null, 2));
        return res;
    }
    async __get(args, subparsers) {
        /** Expose 'get'
      * Make a direct query to the API using 'GET uri'.
      */
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("__get", { "help": "Expose 'get'. Make a direct query to the API using 'GET uri'." });
            argparser.set_defaults({ "func": this.__get.name });
            argparser.add_argument('--root', { action: 'store_true', help: 'TODO: document' });
            argparser.add_argument('uri', { nargs: '+', help: 'TODO: document' });
            return { status: 0, message: "success" };
        }
        let out = [];
        for (const uri of args.uri) {
            const res = await this.get(uri, { userOrGroupPrefix: !args.root });
            this.show(res);
            out.push(res);
        }
        return out;
    }
    // TODO: Add       resolveWithFullResponse: options.resolveWithFullResponse,
    async post(uri, data, headers = {}) {
        const prefix = this.config.user_id ? `/users/${this.config.user_id}` : `/groups/${this.config.group_id}`;
        uri = `${this.base}${prefix}${uri}`;
        if (this.config.verbose)
            console.error('POST', uri);
        return request({
            method: 'POST',
            uri,
            headers: Object.assign(Object.assign(Object.assign({}, this.headers), { 'Content-Type': 'application/json' }), headers),
            body: data,
        });
    }
    async __post(args, subparsers) {
        /** Expose 'post'. Make a direct query to the API using 'POST uri [--data data]'. */
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("__post", { "help": "Expose 'post'. Make a direct query to the API using 'POST uri [--data data]'." });
            argparser.set_defaults({ "func": this.__post.name });
            argparser.add_argument('uri', { nargs: 1, help: 'TODO: document' });
            argparser.add_argument('--data', { required: true, help: 'Escaped JSON string for post data' });
            return { status: 0, message: "success" };
        }
        const res = await this.post(args.uri, args.data);
        this.print(res);
        return res;
    }
    // TODO: Add       resolveWithFullResponse: options.resolveWithFullResponse,
    async put(uri, data) {
        const prefix = this.config.user_id ? `/users/${this.config.user_id}` : `/groups/${this.config.group_id}`;
        uri = `${this.base}${prefix}${uri}`;
        if (this.config.verbose)
            console.error('PUT', uri);
        return request({
            method: 'PUT',
            uri,
            headers: Object.assign(Object.assign({}, this.headers), { 'Content-Type': 'application/json' }),
            body: data,
        });
    }
    async __put(args, subparsers) {
        /** Make a direct query to the API using 'PUT uri [--data data]'. */
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("__put", { "help": "Expose 'put'. Make a direct query to the API using 'PUT uri [--data data]'." });
            argparser.set_defaults({ "func": this.__put.name });
            argparser.add_argument('uri', { nargs: 1, help: 'TODO: document' });
            argparser.add_argument('--data', { required: true, help: 'Escaped JSON string for post data' });
            return { status: 0, message: "success" };
        }
        const res = await this.put(args.uri, args.data);
        this.print(res);
        return res;
    }
    // patch does not return any data. 
    // TODO: 'request-response' is deprecated - replace by something else? (axios?)
    // TODO: Errors are not handled - add this to patch (below) but needs adding to others.
    async patch(uri, data, version) {
        const prefix = this.config.user_id ? `/users/${this.config.user_id}` : `/groups/${this.config.group_id}`;
        const headers = Object.assign(Object.assign({}, this.headers), { 'Content-Type': 'application/json' });
        if (typeof version !== 'undefined')
            headers['If-Unmodified-Since-Version'] = version;
        uri = `${this.base}${prefix}${uri}`;
        if (this.config.verbose)
            console.error('PATCH', uri);
        const res = await request({
            method: 'PATCH',
            uri,
            headers,
            body: data,
            resolveWithFullResponse: true
        }).then().catch(error => {
            console.log("TEMPORARY=" + JSON.stringify(error, null, 2));
            return error;
        });
        return res;
    }
    async __patch(args, subparsers) {
        /** Make a direct query to the API using 'PATCH uri [--data data]'. */
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("__patch", { "help": "Expose 'patch'. Make a direct query to the API using 'PATCH uri [--data data]'." });
            argparser.set_defaults({ "func": this.__patch.name });
            argparser.add_argument('uri', { nargs: 1, help: 'TODO: document' });
            argparser.add_argument('--data', { required: true, help: 'Escaped JSON string for post data' });
            argparser.add_argument('--version', { required: true, help: 'Version of Zotero record (obtained previously)' });
            return { status: 0, message: "success" };
        }
        const res = await this.patch(args.uri, args.data, args.version);
        this.print(res);
        return res;
    }
    // TODO: Add       resolveWithFullResponse: options.resolveWithFullResponse,
    async delete(uri, version) {
        const prefix = this.config.user_id ? `/users/${this.config.user_id}` : `/groups/${this.config.group_id}`;
        const headers = Object.assign(Object.assign({}, this.headers), { 'Content-Type': 'application/json' });
        if (typeof version !== 'undefined')
            headers['If-Unmodified-Since-Version'] = version;
        uri = `${this.base}${prefix}${uri}`;
        if (this.config.verbose)
            console.error('DELETE', uri);
        return request({
            method: 'DELETE',
            uri,
            headers,
        });
    }
    async __delete(args, subparsers) {
        /** Make a direct delete query to the API using 'DELETE uri'. */
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("__delete", { "help": "Expose 'delete'. Make a direct delete query to the API using 'DELETE uri'." });
            argparser.set_defaults({ "func": this.__delete.name });
            argparser.add_argument('uri', { nargs: '+', help: 'Request uri' });
            return { status: 0, message: "success" };
        }
        let out = [];
        for (const uri of args.uri) {
            const response = await this.get(uri);
            out.push[await this.delete(uri, response.version)];
        }
        return out;
    }
    async key(args, subparsers) {
        /** Show details about this API key. (API: /keys ) */
        if (args.getInterface && subparsers) {
            const parser_key = subparsers.add_parser("key", { "help": "Show details about an API key. (API: /keys )" });
            parser_key.set_defaults({ "func": this.key.name });
            return { status: 0, message: "success" };
        }
        const res = await this.get(`/keys/${args.api_key}`, { userOrGroupPrefix: false });
        this.show(res);
        return res;
    }
    // End of standard API calls
    // Utility functions. private?
    async count(uri, params = {}) {
        return (await this.get(uri, { resolveWithFullResponse: true, params })).headers['total-results'];
    }
    show(v) {
        //TODO: Look at the type of v: if string, then print, if object, then stringify
        // this.print(JSON.stringify(v, null, this.config.indent).replace(new RegExp(this.config.api_key, 'g'), '<API-KEY>'))
        this.print("show=" + JSON.stringify(v, null, this.config.indent));
    }
    extractKeyAndSetGroup(key) {
        // zotero://select/groups/(\d+)/(items|collections)/([A-Z01-9]+)
        var out = key;
        var res = key.match(/^zotero\:\/\/select\/groups\/(library|\d+)\/(items|collections)\/([A-Z01-9]+)/);
        if (res) {
            if (res[2] == "library") {
                console.log('You cannot specify zotero-select links (zotero://...) to select user libraries.');
                return;
            }
            else {
                // console.log("Key: zotero://-key provided for "+res[2]+" Setting group-id.")
                this.config.group_id = res[1];
                out = res[3];
            }
            ;
        }
        return out;
    }
    objectifyTags(tags) {
        let tagsarr = [];
        if (tags) {
            tags.forEach(mytag => {
                tagsarr.push({ tag: mytag, type: 0 });
            });
        }
        return tagsarr;
    }
    async attachNoteToItem(PARENT, options = { content: "Note note.", tags: [] }) {
        const tags = this.objectifyTags(options.tags);
        const noteText = options.content.replace(/\n/, "\\n").replace(/\"/, '\\\"');
        const json = {
            "parentItem": PARENT,
            "itemType": "note",
            "note": noteText,
            "tags": tags,
            "collections": [],
            "relations": {}
        };
        return this.create_item({ item: json });
    }
    // TODO: Rewrite other function args like this.
    // Rather than fn(args) have fn({......})
    async attachLinkToItem(PARENT, URL, options = { title: "Click to open", tags: [] }) {
        const tags = this.objectifyTags(options.tags);
        console.log("Linktitle=" + options.title);
        const json = {
            "parentItem": PARENT,
            "itemType": "attachment",
            "linkMode": "linked_url",
            "title": options.title,
            "url": URL,
            "note": "",
            "contentType": "",
            "charset": "",
            "tags": tags,
            "relations": {}
        };
        return this.create_item({ item: json });
    }
    /// THE COMMANDS --> public
    // The following functions define key API commands: /keys, /collection, /collections, etc.
    // https://www.zotero.org/support/dev/web_api/v3/basics
    // Collections
    // <userOrGroupPrefix>/collections	Collections in the library
    // <userOrGroupPrefix>/collections/top	Top-level collections in the library
    // <userOrGroupPrefix>/collections/<collectionKey>	A specific collection in the library
    // <userOrGroupPrefix>/collections/<collectionKey>/collections	Subcollections within a specific collection in the library
    // TODO: --create-child should go into 'collection'.
    // zotero-cli, 
    // If I call $collections(subparser) -> add options to subparser
    // $collections(null) -> perform cllections action (using args)
    async collections(args, subparsers) {
        /* Retrieve a list of collections or create a collection. (API: /collections, /collections/top, /collections/<collectionKey>/collections). Use 'collections --help' for details. */
        if (args.getInterface && subparsers) {
            //async $collections
            const parser_collections = subparsers.add_parser("collections", { "help": "Retrieve sub-collections and create new collections." });
            parser_collections.set_defaults({ "func": "collections" });
            parser_collections.add_argument('--top', { action: 'store_true', help: 'Show only collection at top level.' });
            parser_collections.add_argument('--key', { nargs: 1, required: true, help: 'Show all the child collections of collection with key. You can provide the key as zotero-select link (zotero://...) to also set the group-id.' });
            parser_collections.add_argument('--create-child', { nargs: '*', help: 'Create child collections of key (or at the top level if no key is specified) with the names specified.' });
            return { status: 0, message: "success" };
        }
        /*
        The above means that I can call:
        args.argparser = new argparser
        Zotero.$collections(args)
        Zotero.$collection(args)
        Zotero.$items(args)
        Zotero.$item(args)
        */
        // Provide guidance to the user:  This function requires:
        // args.key (string, required) 
        // args.top (boolean, optional)
        // args.create_child (string, optional)
        // perform tests: args.key
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
        }
        else {
            return this.message(0, 'Unable to extract group/key from the string provided.');
        }
        // perform test: args.create_child
        // If create_child=true, then create the child and exit.
        if (args.create_child) {
            const response = await this.post('/collections', JSON.stringify(args.create_child.map(c => { return { name: c, parentCollection: args.key }; })));
            //this.print('Collections created: ', JSON.parse(response).successful)
            return response;
        }
        else {
            // test for args.top: Not required.
            // If create_child==false:
            let collections = null;
            if (args.key) {
                collections = await this.all(`/collections/${args.key}/collections`);
            }
            else {
                collections = await this.all(`/collections${args.top ? '/top' : ''}`);
            }
            this.show(collections);
            this.finalActions(collections);
            if (args.terse) {
                console.log("test");
                collections = collections.map(element => Object({ "key": element.data.key, "name": element.data.name }));
            }
            ;
            return collections;
        }
    }
    // Operate on a specific collection.
    // <userOrGroupPrefix>/collections/<collectionKey>/items	Items within a specific collection in the library
    // <userOrGroupPrefix>/collections/<collectionKey>/items/top	Top-level items within a specific collection in the library
    // TODO: --create-child should go into 'collection'.
    // DONE: Why is does the setup for --add and --remove differ? Should 'add' not be "nargs: '*'"? Remove 'itemkeys'?
    // TODO: Add option "--output file.json" to pipe output to file.
    async collection(args, subparsers) {
        /**
      Retrieve information about a specific collection --key KEY (API: /collections/KEY or /collections/KEY/tags). Use 'collection --help' for details.
      (Note: Retrieve items is a collection via 'items --collection KEY'.)
         */
        this.reconfigure(args);
        if (args.getInterface && subparsers) {
            //async $collection
            const parser_collection = subparsers.add_parser("collection", { "help": "Retrieve collection information, display tags, add/remove items. (API: /collections/KEY or /collections/KEY/tags). (Note: Retrieve items is a collection: use 'items --collection KEY'.) " });
            parser_collection.set_defaults({ "func": this.collection.name });
            parser_collection.add_argument('--key', { nargs: 1, help: 'The key of the collection (required). You can provide the key as zotero-select link (zotero://...) to also set the group-id.' });
            parser_collection.add_argument('--tags', { action: 'store_true', help: 'Display tags present in the collection.' });
            parser_collection.add_argument('itemkeys', { nargs: '*', help: 'Item keys for items to be added or removed from this collection.' });
            parser_collection.add_argument('--add', { nargs: '*', help: 'Add items to this collection. Note that adding items to collections with \'item --addtocollection\' may require fewer API queries. (Convenience method: patch item->data->collections.)' });
            parser_collection.add_argument('--remove', { nargs: '*', help: 'Convenience method: Remove items from this collection. Note that removing items from collections with \'item --removefromcollection\' may require fewer API queries. (Convenience method: patch item->data->collections.)' });
            return { status: 0, message: "success" };
        }
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
        }
        else {
            const msg = this.message(0, 'Unable to extract group/key from the string provided.');
            return msg;
        }
        if (args.tags && args.add) {
            const msg = this.message(0, '--tags cannot be combined with --add');
            return msg;
        }
        if (args.tags && args.remove) {
            const msg = this.message(0, '--tags cannot be combined with --remove');
            return msg;
        }
        /*
        if (args.add && !args.itemkeys.length) {
          const msg = this.message(0,'--add requires item keys')
          return msg
        }
        if (!args.add && args.itemkeys.length) {
          const msg = this.message(0,'unexpected item keys')
          return msg
        }
        */
        if (args.add) {
            for (const itemKey of args.add) {
                const item = await this.get(`/items/${itemKey}`);
                if (item.data.collections.includes(args.key))
                    continue;
                await this.patch(`/items/${itemKey}`, JSON.stringify({ collections: item.data.collections.concat(args.key) }), item.version);
            }
        }
        if (args.remove) {
            for (const itemKey of args.remove) {
                const item = await this.get(`/items/${itemKey}`);
                const index = item.data.collections.indexOf(args.key);
                if (index > -1) {
                    item.data.collections.splice(index, 1);
                }
                await this.patch(`/items/${itemKey}`, JSON.stringify({ collections: item.data.collections }), item.version);
            }
        }
        const res = await this.get(`/collections/${args.key}${args.tags ? '/tags' : ''}`);
        this.show(res);
        return res;
    }
    // URI	Description
    // https://www.zotero.org/support/dev/web_api/v3/basics
    // <userOrGroupPrefix>/items	All items in the library, excluding trashed items
    // <userOrGroupPrefix>/items/top	Top-level items in the library, excluding trashed items
    async items(args, subparsers) {
        /**
      Retrieve list of items from API. (API: /items, /items/top, /collections/COLLECTION/items/top).
      Use 'items --help' for details.
      By default, all items are retrieved. With --top or limit (via --filter) the default number of items are retrieved.
        */
        let items;
        this.reconfigure(args);
        if (args.getInterface && subparsers) {
            //async items
            const parser_items = subparsers.add_parser("items", { "help": "Retrieve items, retrieve items within collections, with filter is required. Count items. By default, all items are retrieved. With --top or limit (via --filter) the default number of items are retrieved. (API: /items, /items/top, /collections/COLLECTION/items/top)" });
            parser_items.set_defaults({ "func": this.items.name });
            parser_items.add_argument('--count', { action: 'store_true', help: 'Return the number of items.' });
            // argparser.add_argument('--all', { action: 'store_true', help: 'obsolete' })
            parser_items.add_argument('--filter', { type: subparsers.json, help: 'Provide a filter as described in the Zotero API documentation under read requests / parameters. For example: \'{"format": "json,bib", "limit": 100, "start": 100}\'.' });
            parser_items.add_argument('--collection', { help: 'Retrive list of items for collection. You can provide the collection key as a zotero-select link (zotero://...) to also set the group-id.' });
            parser_items.add_argument('--top', { action: 'store_true', help: 'Retrieve top-level items in the library/collection (excluding child items / attachments, excluding trashed items).' });
            parser_items.add_argument('--validate', { type: subparsers.path, help: 'json-schema file for all itemtypes, or directory with schema files, one per itemtype.' });
            return { status: 0, message: "success" };
        }
        if (args.count && args.validate) {
            const msg = this.message(0, '--count cannot be combined with --validate');
            return msg;
        }
        if (args.collection) {
            args.collection = this.extractKeyAndSetGroup(args.collection);
            if (!args.collection) {
                const msg = this.message(0, 'Unable to extract group/key from the string provided.');
                return msg;
            }
        }
        const collection = args.collection ? `/collections/${args.collection}` : '';
        if (args.count) {
            this.print(await this.count(`${collection}/items${args.top ? '/top' : ''}`, args.filter || {}));
            return;
        }
        const params = args.filter || {};
        if (args.top) {
            // This should be all - there may be more than 100 items.
            // items = await this.all(`${collection}/items/top`, { params })
            items = await this.all(`${collection}/items/top`, params);
        }
        else if (params.limit) {
            if (params.limit > 100) {
                const msg = this.message(0, 'You can only retrieve up to 100 items with with params.limit.');
                return msg;
            }
            items = await this.get(`${collection}/items`, { params });
        }
        else {
            items = await this.all(`${collection}/items`, params);
        }
        if (args.validate) {
            if (!fs.existsSync(args.validate))
                throw new Error(`${args.validate} does not exist`);
            const oneSchema = fs.lstatSync(args.validate).isFile();
            let validate = oneSchema ? ajv.compile(JSON.parse(fs.readFileSync(args.validate, 'utf-8'))) : null;
            const validators = {};
            // still a bit rudimentary
            for (const item of items) {
                if (!oneSchema) {
                    validate = validators[item.itemType] = validators[item.itemType] || ajv.compile(JSON.parse(fs.readFileSync(path.join(args.validate, `${item.itemType}.json`), 'utf-8')));
                }
                if (!validate(item))
                    this.show(validate.errors);
            }
        }
        else {
            this.show(items);
        }
        return items;
    }
    // https://www.zotero.org/support/dev/web_api/v3/basics
    // <userOrGroupPrefix>/items/<itemKey>	A specific item in the library
    // <userOrGroupPrefix>/items/<itemKey>/children	Child items under a specific item
    /*
      getFuncName() {
        return this.getFuncName.caller.name
      }
    */
    async item(args, subparsers) {
        /**
      Retrieve an item (item --key KEY), save/add file attachments, retrieve children. Manage collections and tags. (API: /items/KEY/ or /items/KEY/children).
       
      Also see 'attachment', 'create' and 'update'.
        */
        // console.log("HERE="+this.getFuncName())
        this.reconfigure(args);
        // $item({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            //async item
            const parser_item = subparsers.add_parser("item", { "help": "Modify items: Add/remove tags, attach/save files, add to collection/remove, get child items. (API: /items/KEY/ or /items/KEY/children)" });
            parser_item.set_defaults({ "func": this.item.name });
            parser_item.add_argument('--key', {
                "action": "store",
                "required": true,
                "help": 'The key of the item. You can provide the key as zotero-select link (zotero://...) to also set the group-id.'
            });
            parser_item.add_argument('--children', { action: 'store_true', help: 'Retrieve list of children for the item.' });
            parser_item.add_argument('--filter', {
                type: subparsers.json,
                help: 'Provide a filter as described in the Zotero API documentation under read requests / parameters. To retrieve multiple items you have use "itemkey"; for example: \'{"format": "json,bib", "itemkey": "A,B,C"}\'. See https://www.zotero.org/support/dev/web_api/v3/basics#search_syntax.'
            });
            parser_item.add_argument('--addfile', { nargs: '*', help: 'Upload attachments to the item. (/items/new)' });
            parser_item.add_argument('--savefiles', { nargs: '*', help: 'Download all attachments from the item (/items/KEY/file).' });
            parser_item.add_argument('--addtocollection', { nargs: '*', help: 'Add item to collections. (Convenience method: patch item->data->collections.)' });
            parser_item.add_argument('--removefromcollection', { nargs: '*', help: 'Remove item from collections. (Convenience method: patch item->data->collections.)' });
            parser_item.add_argument('--addtags', { nargs: '*', help: 'Add tags to item. (Convenience method: patch item->data->tags.)' });
            parser_item.add_argument('--removetags', { nargs: '*', help: 'Remove tags from item. (Convenience method: patch item->data->tags.)' });
            return { status: 0, message: "success" };
        }
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
            if (!args.key) {
                const msg = this.message(0, 'Unable to extract group/key from the string provided.');
                return msg;
            }
        }
        const item = await this.get(`/items/${args.key}`);
        if (args.savefiles) {
            let children = await this.get(`/items/${args.key}/children`);
            await Promise.all(children.filter(item => item.data.itemType === 'attachment').map(async (item) => {
                if (item.data.filename) {
                    console.log(`Downloading file ${item.data.filename}`);
                    fs.writeFileSync(item.data.filename, await this.get(`/items/${item.key}/file`), 'binary');
                }
                else {
                    console.log(`Not downloading file ${item.key}/${item.data.itemType}/${item.data.linkMode}/${item.data.title}`);
                }
            }));
        }
        if (args.addfile) {
            const attachmentTemplate = await this.get('/items/new?itemType=attachment&linkMode=imported_file', { userOrGroupPrefix: false });
            for (const filename of args.addfile) {
                if (!fs.existsSync(filename)) {
                    const msg = this.message(0, `Ignoring non-existing file: ${filename}.`);
                    return msg;
                }
                let attach = attachmentTemplate;
                attach.title = path.basename(filename);
                attach.filename = path.basename(filename);
                attach.contentType = `application/${path.extname(filename).slice(1)}`;
                attach.parentItem = args.key;
                const stat = fs.statSync(filename);
                const uploadItem = JSON.parse(await this.post('/items', JSON.stringify([attach])));
                const uploadAuth = JSON.parse(await this.post(`/items/${uploadItem.successful[0].key}/file?md5=${md5.sync(filename)}&filename=${attach.filename}&filesize=${fs.statSync(filename)['size']}&mtime=${stat.mtimeMs}`, '{}', { 'If-None-Match': '*' }));
                if (uploadAuth.exists !== 1) {
                    const uploadResponse = await request({
                        method: 'POST',
                        uri: uploadAuth.url,
                        body: Buffer.concat([Buffer.from(uploadAuth.prefix), fs.readFileSync(filename), Buffer.from(uploadAuth.suffix)]),
                        headers: { 'Content-Type': uploadAuth.contentType }
                    });
                    if (args.verbose) {
                        console.log("uploadResponse=");
                        this.show(uploadResponse);
                    }
                    await this.post(`/items/${uploadItem.successful[0].key}/file?upload=${uploadAuth.uploadKey}`, '{}', { 'Content-Type': 'application/x-www-form-urlencoded', 'If-None-Match': '*' });
                }
            }
        }
        if (args.addtocollection) {
            let newCollections = item.data.collections;
            args.addtocollection.forEach(itemKey => {
                if (!newCollections.includes(itemKey)) {
                    newCollections.push(itemKey);
                }
            });
            await this.patch(`/items/${args.key}`, JSON.stringify({ collections: newCollections }), item.version);
        }
        if (args.removefromcollection) {
            let newCollections = item.data.collections;
            args.removefromcollection.forEach(itemKey => {
                const index = newCollections.indexOf(itemKey);
                if (index > -1) {
                    newCollections.splice(index, 1);
                }
            });
            await this.patch(`/items/${args.key}`, JSON.stringify({ collections: newCollections }), item.version);
        }
        if (args.addtags) {
            let newTags = item.data.tags;
            args.addtags.forEach(tag => {
                if (!newTags.find(newTag => newTag.tag === tag)) {
                    newTags.push({ tag });
                }
            });
            await this.patch(`/items/${args.key}`, JSON.stringify({ tags: newTags }), item.version);
        }
        if (args.removetags) {
            let newTags = item.data.tags.filter(tag => !args.removetags.includes(tag.tag));
            await this.patch(`/items/${args.key}`, JSON.stringify({ tags: newTags }), item.version);
        }
        const params = args.filter || {};
        let result;
        if (args.children) {
            result = await this.get(`/items/${args.key}/children`, { params });
        }
        else {
            if (args.addtocollection || args.removefromcollection
                || args.removetags || args.addtags) {
                result = await this.get(`/items/${args.key}`, { params });
            }
            else {
                // Nothing about the item has changed:
                result = item;
            }
        }
        //this.show(result)
        // console.log(JSON.stringify(args))
        this.finalActions(result);
        if (args.fullresponse) {
            return result;
        }
        else {
            return result.data;
        }
        // TODO: What if this fails? Zotero will return, e.g.   "message": "404 - {\"type\":\"Buffer\",\"data\":[78,111,116,32,102,111,117,110,100]}",
        // console.log(Buffer.from(obj.data).toString())
        // Need to return a proper message.
    }
    async attachment(args, subparsers) {
        /**
      Retrieve/save file attachments for the item specified with --key KEY (API: /items/KEY/file).
      Also see 'item', which has options for adding/saving file attachments.
        */
        this.reconfigure(args);
        if (args.getInterface && subparsers) {
            //async attachement
            const parser_attachment = subparsers.add_parser("attachment", { "help": "Save file attachments for the item specified with --key KEY (API: /items/KEY/file). Also see 'item', which has options for adding/saving file attachments. " });
            parser_attachment.set_defaults({ "func": this.attachment.name });
            parser_attachment.add_argument('--key', { "action": "store", required: true, help: 'The key of the item. You can provide the key as zotero-select link (zotero://...) to also set the group-id.' });
            parser_attachment.add_argument('--save', { "action": "store", required: true, help: 'Filename to save attachment to.' });
            return { status: 0, message: "success" };
        }
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
            if (!args.key) {
                const msg = this.message(0, 'Unable to extract group/key from the string provided.');
                return msg;
            }
        }
        fs.writeFileSync(args.save, await this.get(`/items/${args.key}/file`), 'binary');
        // TODO return better value.
        return this.message(0, 'File saved', args.save);
    }
    async create_item(args, subparsers) {
        /**
      Create a new item or items. (API: /items/new) You can retrieve a template with the --template option.
      Use this option to create both top-level items, as well as child items (including notes and links).
        */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            //async create item
            const parser_create = subparsers.add_parser("create", { "help": "Create a new item or items. (API: /items/new) You can retrieve a template with the --template option. Use this option to create both top-level items, as well as child items (including notes and links)." });
            parser_create.set_defaults({ "func": this.create_item.name });
            parser_create.add_argument('--template', { help: "Retrieve a template for the item you wish to create. You can retrieve the template types using the main argument 'types'." });
            parser_create.add_argument('items', { nargs: '*', help: 'Json files for the items to be created.' });
            return { status: 0, message: "success" };
        }
        if (args.template) {
            const result = await this.get('/items/new', { userOrGroupPrefix: false, params: { itemType: args.template } });
            this.show(result);
            //console.log("/"+result+"/")
            return result;
        }
        else if ("files" in args && args.files.length > 0) {
            if (!args.files.length)
                return this.message(0, 'Need at least one item (args.items) to create or use args.template');
            const items = args.files.map(item => JSON.parse(fs.readFileSync(item, 'utf-8')));
            //console.log("input")
            //this.show(items)
            const result = await this.post('/items', JSON.stringify(items));
            const res = JSON.parse(result);
            this.show(res);
            // TODO: see how to use pruneData
            return res;
        }
        else if ("items" in args && args.items.length > 0) {
            const result = await this.post('/items', JSON.stringify(args.items));
            const res = JSON.parse(result);
            this.show(res);
            // TODO: see how to use pruneData
            return res;
        }
        else if (args.item) {
            const result = await this.post('/items', "[" + JSON.stringify(args.item) + "]");
            // console.log(result)
            const res = JSON.parse(result);
            this.show(res);
            return this.pruneData(res, args.fullresponse);
        }
    }
    /*
      private pruneResponse(res) {
        return this.pruneData(res, args.fullresponse)
      }
    */
    pruneData(res, fullresponse = false) {
        if (fullresponse)
            return res;
        return res.successful["0"].data;
    }
    async update_item(args, subparsers) {
        /** Update/replace an item (--key KEY), either update (API: patch /items/KEY) or replacing (using --replace, API: put /items/KEY). */
        this.reconfigure(args);
        if (args.getInterface && subparsers) {
            //update item
            const parser_update = subparsers.add_parser("update", { "help": "Update/replace an item (--key KEY), either update (API: patch /items/KEY) or replacing (using --replace, API: put /items/KEY)." });
            parser_update.set_defaults({ "func": this.update_item.name });
            parser_update.add_argument('--key', { required: true, help: 'The key of the item. You can provide the key as zotero-select link (zotero://...) to also set the group-id.' });
            parser_update.add_argument('--replace', { action: 'store_true', help: 'Replace the item by sumbitting the complete json.' });
            parser_update.add_argument('items', { nargs: 1, help: 'Path of item files in json format.' });
            return { status: 0, message: "success" };
        }
        if (!args.replace) {
            args.replace = false;
        }
        //console.log("1")
        if (args.update && args.json) {
            return this.message(0, "You cannot specify both data and json.", args);
        }
        if (!args.update && !args.json) {
            return this.message(0, "You must specify either data or json.", args);
        }
        //console.log("2a")
        if (args.json) {
            args.update = JSON.parse(args.json);
        }
        //console.log("2b")
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
        }
        else {
            const msg = this.message(0, 'Unable to extract group/key from the string provided. Arguments attached.', args);
            console.log(msg);
            //return msg
        }
        //console.log("2c")
        let originalItemVersion = 0;
        if (args.version) {
            originalItemVersion = args.version;
        }
        else {
            const originalItem = await this.get(`/items/${args.key}`);
            originalItemVersion = originalItem.version;
        }
        //console.log("3")
        //console.log("TEMPORARY args=" + JSON.stringify(args, null, 2))
        const jsonstr = JSON.stringify(args.update);
        //console.log("j=" + jsonstr)
        const result = await this[args.replace ? 'put' : 'patch'](`/items/${args.key}`, jsonstr, originalItemVersion);
        //console.log("X=" + JSON.stringify(result, null, 2))
        return result;
    }
    async update_item_file(args, subparsers) {
        /** Update/replace an item (--key KEY), either update (API: patch /items/KEY) or replacing (using --replace, API: put /items/KEY). */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("update-item-file", { "help": "Update item from file. Update/replace an item (--key KEY), either update (API: patch /items/KEY) or replacing (using --replace, API: put /items/KEY)." });
            argparser.set_defaults({ "func": this.update_item_file.name });
            argparser.add_argument('--key', { required: true, help: 'The key of the item. You can provide the key as zotero-select link (zotero://...) to also set the group-id.' });
            argparser.add_argument('--replace', { action: 'store_true', help: 'Replace the item by sumbitting the complete json.' });
            argparser.add_argument('items', { nargs: 1, help: 'Path of file in json format.' });
            return { status: 0, message: "success" };
        }
        if (args.key) {
            args.key = this.extractKeyAndSetGroup(args.key);
        }
        else {
            const msg = this.message(0, 'Unable to extract group/key from the string provided. Arguments attached.', args);
            return msg;
        }
        // TODO return item
        const originalItem = await this.get(`/items/${args.key}`);
        for (const item of args.items) {
            await this[args.replace ? 'put' : 'patch'](`/items/${args.key}`, fs.readFileSync(item), originalItem.version);
        }
        return this.message(0, "Done");
    }
    // <userOrGroupPrefix>/items/trash	Items in the trash
    async trash(args, subparsers) {
        /** Return a list of items in the trash. */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            return null;
        }
        const items = await this.get('/items/trash');
        this.show(items);
        return items;
    }
    // https://www.zotero.org/support/dev/web_api/v3/basics
    // <userOrGroupPrefix>/publications/items	Items in My Publications  
    async publications(args, subparsers) {
        /** Return a list of items in publications (user library only). (API: /publications/items) */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("publications", { "help": "Return a list of items in publications (user library only). (API: /publications/items)" });
            argparser.set_defaults({ "func": this.publications.name });
            return;
        }
        const items = await this.get('/publications/items');
        this.show(items);
        return items;
    }
    // itemTypes
    async types(args, subparsers) {
        /** Retrieve a list of items types available in Zotero. (API: /itemTypes) */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("types", { "help": "Retrieve a list of items types available in Zotero. (API: /itemTypes)." });
            argparser.set_defaults({ "func": this.types.name });
            return;
        }
        const types = await this.get('/itemTypes', { userOrGroupPrefix: false });
        this.show(types);
        return types;
    }
    async groups(args, subparsers) {
        /** Retrieve the Zotero groups data to which the current library_id and api_key has access to. (API: /users/<user-id>/groups) */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("groups", { "help": "Retrieve the Zotero groups data to which the current library_id and api_key has access to. (API: /users/<user-id>/groups)" });
            argparser.set_defaults({ "func": this.groups.name });
            return this.message(0, "success", args);
        }
        let groups = await this.get('/groups');
        this.show(groups);
        return groups;
    }
    async fields(args, subparsers) {
        /**
         * Retrieve a template with the fields for --type TYPE (API: /itemTypeFields, /itemTypeCreatorTypes) or all item fields (API: /itemFields).
         * Note that to retrieve a template, use 'create-item --template TYPE' rather than this command.
         */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("fields", { "help": "Retrieve a template with the fields for --type TYPE (API: /itemTypeFields, /itemTypeCreatorTypes) or all item fields (API: /itemFields). Note that to retrieve a template, use 'create-item --template TYPE' rather than this command." });
            argparser.set_defaults({ "func": this.fields.name });
            argparser.add_argument('--type', { help: 'Display fields types for TYPE.' });
            return { status: 0, message: "success" };
        }
        if (args.type) {
            const result = {
                "itemTypeFields": await this.get('/itemTypeFields', { params: { itemType: args.type }, userOrGroupPrefix: false }),
                "itemTypeCreatorTypes": await this.get('/itemTypeCreatorTypes', { params: { itemType: args.type }, userOrGroupPrefix: false })
            };
            this.show(result);
            return result;
        }
        else {
            const result = { "itemFields": await this.get('/itemFields', { userOrGroupPrefix: false }) };
            this.show(result);
            return result;
        }
    }
    // Searches
    // https://www.zotero.org/support/dev/web_api/v3/basics
    async searches(args, subparsers) {
        /** Return a list of the saved searches of the library. Create new saved searches. (API: /searches) */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("searches", { "help": "Return a list of the saved searches of the library. Create new saved searches. (API: /searches)" });
            argparser.set_defaults({ "func": this.searches.name });
            argparser.add_argument('--create', { nargs: 1, help: 'Path of JSON file containing the definitions of saved searches.' });
            return { status: 0, message: "success" };
        }
        if (args.create) {
            let searchDef = [];
            try {
                searchDef = JSON.parse(fs.readFileSync(args.create[0], 'utf8'));
            }
            catch (ex) {
                console.log('Invalid search definition: ', ex);
            }
            if (!Array.isArray(searchDef)) {
                searchDef = [searchDef];
            }
            const res = await this.post('/searches', JSON.stringify(searchDef));
            this.print('Saved search(s) created successfully.');
            return res;
        }
        const items = await this.get('/searches');
        this.show(items);
        return items;
    }
    // Tags
    async tags(args, subparsers) {
        /** Return a list of tags in the library. Options to filter and count tags. (API: /tags) */
        this.reconfigure(args);
        // function.name({"argparser": subparser}) returns CLI definition.
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("tags", { "help": "Return a list of tags in the library. Options to filter and count tags. (API: /tags)" });
            argparser.set_defaults({ "func": this.tags.name });
            argparser.add_argument('--filter', { help: 'Tags of all types matching a specific name.' });
            argparser.add_argument('--count', { action: 'store_true', help: 'TODO: document' });
            return { status: 0, message: "success" };
        }
        let rawTags = null;
        if (args.filter) {
            rawTags = await this.all(`/tags/${encodeURIComponent(args.filter)}`);
        }
        else {
            rawTags = await this.all('/tags');
        }
        const tags = rawTags.map(tag => tag.tag).sort();
        if (args.count) {
            const tag_counts = {};
            for (const tag of tags) {
                tag_counts[tag] = await this.count('/items', { tag });
            }
            this.print(tag_counts);
            return tag_counts;
        }
        else {
            this.show(tags);
            return tags;
        }
    }
    /**
     * Utility functions.
     */
    // Update the DOI of the item provided.
    async update_doi(args, subparsers) {
        // We dont know what kind of item this is - gotta get the item to see
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("update-doi", { "help": "Update the DOI for the item." });
            argparser.set_defaults({ "func": this.update_doi.name });
            argparser.add_argument("key", {
                "nargs": 1,
                "action": "store",
                "help": "The Zotero item key for the item to be updated."
            });
            argparser.add_argument("--doi", {
                "nargs": 1,
                "action": "store",
                "help": "The DOI for the item"
            });
        }
        args.fullresponse = false;
        const item = await this.item(args);
        //const item = this.pruneData(response)
        if (args.doi) {
            // TODO: should scan item.extra and check for existing DOI
            if (!item.doi)
                console.log("TODO: zotero-lib - should scan item.extra and check for existing DOI");
            const extra = item.extra + `\nDOI: ${args.doi}`;
            const updateargs = {
                key: args.key,
                version: item.version,
                update: item.doi ? { doi: args.doi } : { extra: extra },
                fullresponse: false,
                show: true
            };
            // ACTION: check arguments
            // ACTION: run code
            const update = await this.update_item(updateargs);
            if (update.statusCode == 204) {
                console.log("update successfull - getting record");
                const zoteroRecord = await this.item({ key: args.key });
                console.log("Result=" + JSON.stringify(zoteroRecord, null, 2));
                return zoteroRecord;
            }
            else {
                console.log("update failed");
                return this.message(1, "update failed");
            }
        }
        else {
            return this.message(1, "update failed - no doi provided");
        }
        // ACTION: return values
        // return 1
    }
    async TEMPLATE(args, subparsers) {
        // ACTION: define CLI interface
        if (args.getInterface && subparsers) {
            const argparser = subparsers.add_parser("TEMPLATE", { "help": "HELPTEXT" });
            argparser.set_defaults({ "func": this.TEMPLATE.name });
            argparser.add_argument("--switch", {
                "action": "store_true",
                "help": "HELPTEXT"
            });
            argparser.add_argument("--arguments", {
                "nargs": "*",
                "action": "store",
                "help": "HELPTEXT"
            });
        }
        // ACTION: check arguments
        if (args.switch) {
        }
        if (args.arguments) {
        }
        // ACTION: run code
        // ACTION: return values
        const data = {};
        return this.message(0, "exist status", data);
    }
    /*
  public async attachment
  
  //  public async attachLinkToItem(PARENT, URL, options: { title?: string, tags?: any } = { title: "Click to open", tags: [] }) {
  
  
  */
    /* Implement
    public update_field() {
      my $str = `zotero-cli $thegroup item --key $item | jq '.data'`;
      print $str;
      if ($key) {
        if (!$value) {
          print & jq("{ $key }", $str);
        } else {
          $str = & jq("{ key, version }", $str);
          $str = & jq(". += { \"$key\":  \"$value\" }", $str);
          say $str;
          if ($update) {
            open F, ">$item.update.json";
            print F $str;
            close F;
            system "zotero-cli --group-id $group update-item --key $item $item.update.json";
          }
        };
      } else {
        print $str;
      };
    }
    */
    /*
  Implement: extra_append
  
    my $str = `./zotUpdateField.pl $thegroup --item $key --key extra | jq " .extra "`;
  
  my @extra ;
  if ($str =~ m/\S/s) {
      $str =~ s/\n$//s;
      $str =~ s/\"$//s;
      $str =~ s/^\"//s;
      @extra = split(/\\n/,$str);
  };
  
  push @extra, @t;
  
  my $string = shell_quote("\"" . join("\\n", @extra) . "\"");
  #print $string;
  
  say `./zotUpdateField.pl $thegroup  --item $key --key extra --value $string --update`;
  
  
  
    */
    /*
    update_url
        system("./zotUpdateField.pl --update --group $a --item $c --key url --value \"\\\"https://docs.opendeved.net/lib/$c\\\"\"");
    */
    /**
     *
     *
     */
    async commandlineinterface() {
        // --- main ---
        var args = this.getArguments();
        //const zotero = new Zotero()
        if (args.version) {
            this.getVersion();
            process.exit(0);
        }
        if (args.verbose) {
            console.log("zotero-cli starting...");
        }
        if (args.dryrun) {
            console.log(`API command:\n Zotero.${args.func}(${JSON.stringify(args, null, 2)})`);
        }
        else {
            /* // ZenodoAPI.${args.func.name}(args)
             //zotero[args.func.name](args).catch(err => {
             args.func(args).catch(err => {
               console.error('error:', err)
               process.exit(1)
             });
           } */
            // using default=2 above prevents the overrides from being picked up                                                                                                     
            if (args.indent === null)
                args.indent = 2;
            this.showConfig();
            // call the actual command        
            if (!args.func) {
                console.log("No arguments provided. Use -h for help.");
                process.exit(0);
            }
            try {
                //await this['$' + args.command.replace(/-/g, '_')]()
                // await this[args.command.replace(/-/g, '_')]()
                console.log("TEMPORARY=" + JSON.stringify(args, null, 2));
                await this[args.func](args);
            }
            catch (ex) {
                this.print('Command execution failed: ', ex);
                process.exit(1);
            }
            if (args.out)
                fs.writeFileSync(args.out, this.output);
            process.exit(1);
        }
    }
    // local functions
    getVersion() {
        const pjson = require('../package.json');
        if (pjson.version)
            console.log(`zenodo-lib version=${pjson.version}`);
        return pjson.version;
    }
    getArguments() {
        const parser = new ArgumentParser({ "description": "Zotero command line utility" });
        parser.add_argument('--api-key', {
            help: 'The API key to access the Zotero API.'
        });
        parser.add_argument('--config', {
            type: parser.file,
            help: 'Configuration file (toml format). Note that ./zotero-cli.toml and ~/.config/zotero-cli/zotero-cli.toml is picked up automatically.'
        });
        parser.add_argument('--user-id', {
            type: parser.integer, help: 'The id of the user library.'
        });
        parser.add_argument('--group-id', {
            action: 'store',
            type: parser.integer,
            help: 'The id of the group library.'
        });
        // See below. If changed, add: You can provide the group-id as zotero-select link (zotero://...). Only the group-id is used, the item/collection id is discarded.
        parser.add_argument('--indent', { type: parser.integer, help: 'Identation for json output.' });
        parser.add_argument('--out', { help: 'Output to file' });
        parser.add_argument('--verbose', { action: 'store_true', help: 'Log requests.' });
        parser.add_argument("--dryrun", {
            "action": "store_true",
            "help": "Show the API request and exit.",
            "default": false
        });
        parser.add_argument("--version", {
            "action": "store_true",
            "help": "Show version",
        });
        /*
        The following code adds subparsers.
        */
        const subparsers = parser.add_subparsers({ "help": "Help for these commands is available via 'command --help'." });
        this.item({ getInterface: true }, subparsers);
        this.items({ getInterface: true }, subparsers);
        this.create_item({ getInterface: true }, subparsers);
        this.update_item({ getInterface: true }, subparsers);
        this.collection({ getInterface: true }, subparsers);
        this.collections({ getInterface: true }, subparsers);
        this.publications({ getInterface: true }, subparsers);
        this.tags({ getInterface: true }, subparsers);
        this.attachment({ getInterface: true }, subparsers);
        this.types({ getInterface: true }, subparsers);
        this.groups({ getInterface: true }, subparsers);
        this.fields({ getInterface: true }, subparsers);
        this.searches({ getInterface: true }, subparsers);
        this.key({ getInterface: true }, subparsers);
        // Utility functions
        this.update_doi({ getInterface: true }, subparsers);
        // Functions for get, post, put, patch, delete. (Delete query to API with uri.)
        this.__get({ getInterface: true }, subparsers);
        this.__post({ getInterface: true }, subparsers);
        this.__put({ getInterface: true }, subparsers);
        this.__patch({ getInterface: true }, subparsers);
        this.__delete({ getInterface: true }, subparsers);
        // Other URLs
        // https://www.zotero.org/support/dev/web_api/v3/basics
        // /keys/<key>	
        // /users/<userID>/groups	
        //parser.set_defaults({ "func": new Zotero().run() });
        //this.parser.parse_args();
        return parser.parse_args();
    }
};
//# sourceMappingURL=zotero-lib.js.map