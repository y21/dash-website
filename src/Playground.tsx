import React, { Suspense, Component } from 'react';
import './Playground.css';
import * as dash from './vendor/dash';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { getRevision } from './util';

const Editor = React.lazy(() => import('@monaco-editor/react'));
const Empty = <></>;

// TODO(y21): typings
declare var EmbeddedConsole: any;

const DEFAULT_CODE = `
// JavaScript code goes here
function* fib() {
    let a = 1;
    let b = 1;
    let current = 1;
  
    yield current;
  
    while (true) {
        current = b;
  
        yield current;
  
        b = a + b;
        a = current;
    }
}

const values = [];
const seq = fib();

for (let i = 0; i < 20; ++i) values.push(seq.next().value + 0);

values
`.trim();

interface PlaygroundState {
    console: any;
    editor: monaco.editor.IStandaloneCodeEditor,
    engine?: dash.Engine,
    vm?: dash.VM
}

class Playground extends Component<{}, PlaygroundState> {
    async componentDidMount() {
        const consoleElement = document.getElementById('console');
        if (!consoleElement) return this.reportError('console not found');

        const ec = new EmbeddedConsole(consoleElement, {
            height: '300px'
        });

        this.setState({
            ...this.state,
            console: ec
        });

        ec.log("Welcome to the dash playground");
        ec.log("Type any JavaScript code in the editor above and press \"Run\"");
        ec.log("The last expression result will appear in this console");

        const rev = await getRevision();
        ec.log(`📦 Build: ${rev.substr(0, 7)}`)
    }

    async onCodeRun() {
        const code = this.getCode();
        if (!code) return this.reportError('failed to get code');

        const vm = await this.getOrInitVM();

        try {
            let result = vm.eval(code);

            // Try to convert the result to a number
            const maybeNumber = Number(result);

            // ... and print it if it is a number
            // we do this because numbers have special higlighting in the console
            // later once the WASM API is more mature and exposes values directly,
            // we can do better than that
            if (!isNaN(maybeNumber)) this.state.console.log(maybeNumber);
            else this.state.console.log(result);
        } catch (e) {
            this.reportError(e);
        }
    }

    onCodeSave() {
        const code = this.getCode();
        if (!code) return this.reportError('failed to get code');

        // Base64 encode code 
        const encoded = btoa(code);
        document.location.href += `?code=${encoded}`;
    }

    getCode() {
        return this.state.editor.getModel()?.getValue();
    }

    async getOrInitVM() {
        const engine = this.state.engine || new dash.Engine();

        if (!this.state.engine) {
            this.setState({ ...this.state, engine });
        }

        if (!engine.initialized) {
            await engine.init('./assets/dash.wasm');
        }

        const vm = this.state.vm || engine.createVM();

        if (!this.state.vm) {
            this.setState({ ...this.state, vm });
        }

        return vm;
    }

    editorDidMount(editor: monaco.editor.IStandaloneCodeEditor) {
        const model = editor.getModel();
        if (!model) return this.reportError('failed to get monaco editor model');

        const params = new URLSearchParams(document.location.search);
        const code = params.get('code');

        if (code) model.setValue(atob(code));
        else model.setValue(DEFAULT_CODE.trim());

        this.setState({ ...this.state, editor });
    }

    reportError(...args: any[]) {
        const error = this.state.console.error.bind(this.state.console) || console.error;
        error(...args);
    }

    render() {
        return (
            <div className="App center">
                <div id="buttons">
                    <span className="button" onClick={this.onCodeRun.bind(this)}>
                        <img src="./assets/playicon.svg" width="40" className="purple-filter" alt="Run code" />
                        <span>Run</span>
                    </span>
                    <span className="button" onClick={this.onCodeSave.bind(this)}>
                        <img src="./assets/saveicon.svg" width="20" className="purple-filter" alt="Save code" />
                        <span className="push-right">Save</span>
                    </span>
                </div>

                <div id="editor">
                    <Suspense fallback={Empty}>
                        <Editor
                            language="javascript"
                            theme="vs-dark"
                            options={{
                                fontSize: 17
                            }}
                            onMount={this.editorDidMount.bind(this)}
                        />
                    </Suspense>
                </div>

                <div id="console"></div>

                <footer>
                    Made with ❤️ by y21
                    <a href="https://github.com/y21/dash" rel="noreferrer" target="_blank" id="view-source">
                        <img src="./assets/github.svg" width="20" id="github-icon" alt="GitHub" />
                        View source
                    </a>
                </footer>
            </div >
        )
    }
};

export default Playground;