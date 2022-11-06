import React, { Suspense, Component } from 'react';
import dash, { ExternalVm, JsValue, OptLevel, infer, debug } from './pkg/wasm';
import './Playground.css';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Emit } from './pkg/wasm';

const Editor = React.lazy(() => import('@monaco-editor/react'));
const Empty = <></>;

const enum Mode {
    EVAL,
    TYPES,
    BYTECODE,
    JS
}

interface PlaygroundState {
    editor: monaco.editor.IStandaloneCodeEditor | null,
    vm: ExternalVm | null,
    output: string,
}

class Playground extends Component<{}, PlaygroundState> {
    autorun = true;
    mode = Mode.EVAL;

    constructor(props: {}) {
        super(props);
        this.state = { editor: null, vm: null, output: '' };
    }

    async componentDidMount() {
    }

    dashEval(vm: ExternalVm, code: string): string {
        const value = vm.eval(code, OptLevel.Aggressive);
        const output = value.to_js_string(vm);

        return output;
    }

    dashInfer(code: string): string {
        return infer(code);
    }

    dashBytecode(code: string): string {
        return debug(code, OptLevel.Aggressive, Emit.Bytecode);
    }

    dashDesugarJs(code: string): string {
        return debug(code, OptLevel.Aggressive, Emit.JavaScript);
    }

    async onCodeRun() {
        console.log(this.mode)
        const code = this.getCode();
        if (!code) return this.reportError('failed to get code');

        localStorage.setItem('code', code);

        const vm = await this.getOrInitVM();
        try {
            let output;
            switch (this.mode) {
                case Mode.EVAL:
                    output = this.dashEval(vm, code);
                    break;
                case Mode.TYPES:
                    output = this.dashInfer(code);
                    break;
                case Mode.BYTECODE:
                    output = this.dashBytecode(code);
                    break;
                case Mode.JS:
                    output = this.dashDesugarJs(code);
                    break;
                default:
                    throw new Error('Unsupported mode');
            }

            this.setState({ ...this.state, output });
        } catch (e) {
            console.log(e);
            if (e instanceof JsValue) {
                this.setState({ ...this.state, output: e.to_js_string(vm) });
            } else if (typeof e === 'string') {
                this.setState({ ...this.state, output: e });
            } else {
                this.setState({ ...this.state, output: '<Unknown error>' });
            }
        }
    }

    getCode() {
        return this.state.editor?.getModel()?.getValue();
    }

    async getOrInitVM() {
        let vm = this.state.vm;
        if (!vm) {
            await dash();
            vm = new ExternalVm();
            this.setState({ ...this.state, vm });
        }
        return vm;
    }

    editorDidMount(editor: monaco.editor.IStandaloneCodeEditor) {
        this.setState({ ...this.state, editor });
    }

    reportError(...args: any[]) {
        // const error = this.state.console.error.bind(this.state.console) || console.error;
        // error(...args);
    }

    onType() {
        if (this.autorun) {
            this.onCodeRun();
        }
    }

    toggleAutorun() {
        this.autorun = !this.autorun;
    }

    setMode() {
        const select = document.getElementById('mode') as HTMLSelectElement;
        switch (select.value) {
            case 'eval': this.mode = Mode.EVAL; break;
            case 'types': this.mode = Mode.TYPES; break;
            case 'bytecode': this.mode = Mode.BYTECODE; break;
            case 'js': this.mode = Mode.JS; break;
        }
    }

    render() {
        return (
            <div className="App">
                <label htmlFor="mode">Select mode: </label>
                <select id="mode" name="mode" onChange={this.setMode.bind(this)}>
                    <option value="eval">Eval</option>
                    <option value="types">Infer types</option>
                    <option value="bytecode">Bytecode</option>
                    <option value="js">Desugar JS</option>
                </select>
                &nbsp;
                <input type="checkbox" name="autoeval" onChange={this.toggleAutorun.bind(this)} defaultChecked></input>
                <label htmlFor="autoeval">Autorun</label>
                &nbsp;
                <button onClick={this.onCodeRun.bind(this)}>Run</button>


                <Suspense fallback={Empty}>
                    <Editor
                        language="javascript"
                        theme="vs-light"
                        width={700}
                        height={250}
                        options={{
                            fontSize: 13
                        }}
                        onMount={this.editorDidMount.bind(this)}
                        onChange={this.onType.bind(this)}
                    />
                </Suspense>
                <h3>Output</h3>
                <textarea cols={75} rows={20} className="editor" value={this.state.output}>
                </textarea>
            </div >
        )
    }
};

export default Playground;
